import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TwoFactorResponse = {
  Status?: string;
  Details?: string;
  OTP?: string;
};

/**
 * 2Factor SMS OTP only.
 *
 * Correct SMS endpoints (GET, no body):
 *   Send (auto):   https://2factor.in/API/V1/{API_KEY}/SMS/{91XXXXXXXXXX}/AUTOGEN
 *   Send + SMS template:
 *                  https://2factor.in/API/V1/{API_KEY}/SMS/{91XXXXXXXXXX}/AUTOGEN/{SMS_TEMPLATE_NAME}
 *   Verify (VERIFY3):
 *                  https://2factor.in/API/V1/{API_KEY}/SMS/VERIFY3/{91XXXXXXXXXX}/{OTP}
 *
 * Voice endpoint (DO NOT USE):
 *   https://2factor.in/API/V1/{API_KEY}/VOICE/{91XXXXXXXXXX}/AUTOGEN
 *
 * Headers: Accept: application/json
 * Method:  GET
 * Body:    none (path-based V1 API)
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly verifiedPhones = new Map<string, number>();
  private readonly verifiedTtlMs = 30 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  /** Normalize to digits with Indian country code (91XXXXXXXXXX). */
  normalizePhone(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) digits = `91${digits}`;
    if (digits.startsWith('0') && digits.length === 11) {
      digits = `91${digits.slice(1)}`;
    }
    if (!/^91\d{10}$/.test(digits)) {
      throw new BadRequestException('Enter a valid 10-digit Indian mobile number.');
    }
    return digits;
  }

  isPhoneVerified(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    const expiresAt = this.verifiedPhones.get(normalized);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.verifiedPhones.delete(normalized);
      return false;
    }
    return true;
  }

  /**
   * Send OTP via SMS only.
   * Uses AUTOGEN so 2Factor generates the 6-digit OTP.
   */
  async sendOtp(phone: string, template?: string) {
    const normalized = this.normalizePhone(phone);
    const apiKey = this.requireApiKey();
    const templateName = this.resolveSmsTemplate(template);

    // SMS-only AUTOGEN path. Never /VOICE/.
    const path = templateName
      ? `/API/V1/${apiKey}/SMS/${normalized}/AUTOGEN/${encodeURIComponent(templateName)}`
      : `/API/V1/${apiKey}/SMS/${normalized}/AUTOGEN`;

    this.logger.log(
      `Sending SMS OTP to ${normalized}` +
        (templateName ? ` using SMS template "${templateName}"` : ' (default SMS template)'),
    );

    const data = await this.callTwoFactor(path);
    if (data.Status !== 'Success' || !data.Details) {
      throw new BadRequestException(data.Details || 'Failed to send SMS OTP.');
    }

    return {
      sessionId: data.Details,
      phone: normalized,
      channel: 'SMS' as const,
      message: 'OTP sent via SMS',
    };
  }

  /**
   * Verify OTP using 2Factor VERIFY3 endpoint (phone_number + otp_entered_by_user).
   * Endpoint: GET https://2factor.in/API/V1/:api_key/SMS/VERIFY3/:phone_number/:otp_entered_by_user
   */
  async verifyOtp(phone: string, sessionIdOrOtp?: string, otpParam?: string) {
    const normalized = this.normalizePhone(phone);
    const apiKey = this.requireApiKey();
    const cleanOtp = (otpParam || sessionIdOrOtp || '').trim();

    if (!cleanOtp) {
      throw new BadRequestException('OTP value is required.');
    }

    const path = `/API/V1/${apiKey}/SMS/VERIFY3/${normalized}/${encodeURIComponent(cleanOtp)}`;
    const data = await this.callTwoFactor(path);

    if (data.Status !== 'Success') {
      throw new BadRequestException(data.Details || 'Invalid or expired OTP.');
    }

    this.verifiedPhones.set(normalized, Date.now() + this.verifiedTtlMs);

    return {
      verified: true,
      phone: normalized,
      message: data.Details || 'OTP Matched',
    };
  }

  /**
   * Only SMS DLT / OTP templates from 2Factor → OTP Services → Manage OTP Templates.
   * Do not use Voice OTP template names (e.g. "Otp verification") — those trigger calls.
   */
  private resolveSmsTemplate(override?: string): string {
    const raw = (
      override?.trim() ||
      this.config.get<string>('TWO_FACTOR_OTP_TEMPLATE') ||
      ''
    ).trim();
    return raw.replace(/^["']|["']$/g, '').trim();
  }

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('TWO_FACTOR_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OTP service is not configured. Set TWO_FACTOR_API_KEY.',
      );
    }
    return apiKey;
  }

  private async callTwoFactor(path: string): Promise<TwoFactorResponse> {
    if (path.includes('/VOICE/')) {
      throw new ServiceUnavailableException(
        'Voice OTP is disabled. Only SMS delivery is allowed.',
      );
    }

    const url = `https://2factor.in${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ServiceUnavailableException('Unable to reach OTP provider.');
    }

    let data: TwoFactorResponse;
    try {
      data = (await response.json()) as TwoFactorResponse;
    } catch {
      throw new ServiceUnavailableException('Invalid response from OTP provider.');
    }

    if (!response.ok && data.Status !== 'Success') {
      throw new BadRequestException(data.Details || 'OTP request failed.');
    }

    return data;
  }
}
