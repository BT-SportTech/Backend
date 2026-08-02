import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TwoFactorResponse = {
  Status?: string;
  Details?: string;
  OTP?: string;
};

@Injectable()
export class OtpService {
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

  async sendOtp(phone: string, template?: string) {
    const normalized = this.normalizePhone(phone);
    const apiKey = this.requireApiKey();
    const templateName =
      template?.trim() ||
      this.config.get<string>('TWO_FACTOR_OTP_TEMPLATE') ||
      '';

    const path = templateName
      ? `/API/V1/${apiKey}/SMS/${normalized}/AUTOGEN/${encodeURIComponent(templateName)}`
      : `/API/V1/${apiKey}/SMS/${normalized}/AUTOGEN`;

    const data = await this.callTwoFactor(path);
    if (data.Status !== 'Success' || !data.Details) {
      throw new BadRequestException(data.Details || 'Failed to send OTP.');
    }

    return {
      sessionId: data.Details,
      phone: normalized,
      message: 'OTP sent successfully',
    };
  }

  async verifyOtp(phone: string, sessionId: string, otp: string) {
    const normalized = this.normalizePhone(phone);
    const apiKey = this.requireApiKey();
    const cleanSession = sessionId.trim();
    const cleanOtp = otp.trim();

    if (!cleanSession) {
      throw new BadRequestException('OTP session is missing. Request a new OTP.');
    }

    const path = `/API/V1/${apiKey}/SMS/VERIFY/${encodeURIComponent(cleanSession)}/${encodeURIComponent(cleanOtp)}`;
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
