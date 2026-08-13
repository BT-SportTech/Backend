import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  organizerInviteHtml,
  organizerInviteSubject,
  organizerInviteText,
} from './templates/organizer-invite.template';

type GraphTokenResponse = {
  access_token: string;
  expires_in: number;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  async sendOrganizerInvite(params: {
    to: string;
    firstName: string;
    inviteUrl: string;
  }) {
    await this.sendMail({
      to: params.to,
      subject: organizerInviteSubject(),
      text: organizerInviteText(params),
      html: organizerInviteHtml(params),
    });
  }

  private parseFromAddress(raw: string): { name?: string; address: string } {
    const match = raw.match(/^(.*)<([^>]+)>$/);
    if (match) {
      const name = match[1].trim().replace(/^"|"$/g, '');
      return { name: name || undefined, address: match[2].trim() };
    }
    return { address: raw.trim() };
  }

  private getGraphConfig():
    | {
        tenantId: string;
        clientId: string;
        clientSecret: string;
        sender: { name?: string; address: string };
      }
    | null {
    const tenantId = this.config.get<string>('MS_GRAPH_TENANT_ID')?.trim();
    const clientId = this.config.get<string>('MS_GRAPH_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('MS_GRAPH_CLIENT_SECRET')?.trim();
    const fromRaw =
      this.config.get<string>('MS_GRAPH_FROM')?.trim() ||
      this.config.get<string>('MS_GRAPH_SENDER')?.trim();

    if (!tenantId || !clientId || !clientSecret || !fromRaw) {
      return null;
    }

    return {
      tenantId,
      clientId,
      clientSecret,
      sender: this.parseFromAddress(fromRaw),
    };
  }

  private async getAccessToken(config: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  }): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Microsoft Graph token request failed (${response.status}): ${error}`,
      );
      throw new Error('Failed to acquire Microsoft Graph access token');
    }

    const data = (await response.json()) as GraphTokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const graphConfig = this.getGraphConfig();

    if (!graphConfig) {
      this.logger.warn(
        `Microsoft Graph mail not configured — invite email for ${options.to}:\nSubject: ${options.subject}\n${options.text}`,
      );
      return;
    }

    const token = await this.getAccessToken(graphConfig);
    const { sender } = graphConfig;

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender.address)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: options.subject,
            body: {
              contentType: 'HTML',
              content: options.html,
            },
            from: {
              emailAddress: {
                address: sender.address,
                ...(sender.name ? { name: sender.name } : {}),
              },
            },
            toRecipients: [
              {
                emailAddress: { address: options.to },
              },
            ],
          },
          saveToSentItems: true,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `Microsoft Graph sendMail failed (${response.status}): ${error}`,
      );
      throw new Error('Failed to send email via Microsoft Graph');
    }
  }
}
