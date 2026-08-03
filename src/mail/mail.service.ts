import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOrganizerInvite(params: {
    to: string;
    firstName: string;
    inviteUrl: string;
  }) {
    const subject = 'You are invited to organise events on SportTech';
    const text = [
      `Hi ${params.firstName},`,
      '',
      'You have been invited to join SportTech as an event organiser.',
      `Accept your invitation: ${params.inviteUrl}`,
      '',
      'This link expires in 48 hours.',
      '',
      '— SportTech',
    ].join('\n');

    const html = `
      <p>Hi ${params.firstName},</p>
      <p>You have been invited to join SportTech as an event organiser.</p>
      <p><a href="${params.inviteUrl}">Accept your invitation</a></p>
      <p>This link expires in 48 hours.</p>
      <p>— SportTech</p>
    `;

    await this.sendMail({ to: params.to, subject, text, html });
  }

  private async sendMail(options: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      'SportTech <noreply@sporttech.local>';

    if (!host) {
      this.logger.warn(
        `SMTP not configured — invite email for ${options.to}:\nSubject: ${options.subject}\n${options.text}`,
      );
      return;
    }

    const port = Number(this.config.get('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  }
}
