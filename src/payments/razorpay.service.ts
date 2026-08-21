import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils';

export type CreateOrderParams = {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
};

@Injectable()
export class RazorpayService {
  private client: Razorpay | null = null;

  constructor(private readonly config: ConfigService) {}

  private ensureConfigured(): {
    client: Razorpay;
    keyId: string;
    keySecret: string;
  } {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID')?.trim() ?? '';
    const keySecret =
      this.config.get<string>('RAZORPAY_KEY_SECRET')?.trim() ?? '';

    if (!keyId || !keySecret) {
      throw new BadRequestException('Payment gateway is not configured.');
    }

    if (!this.client) {
      this.client = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }

    return { client: this.client, keyId, keySecret };
  }

  getKeyId(): string {
    return this.ensureConfigured().keyId;
  }

  async createOrder(params: CreateOrderParams) {
    const { client } = this.ensureConfigured();
    try {
      return await client.orders.create({
        amount: params.amountPaise,
        currency: 'INR',
        receipt: params.receipt,
        notes: params.notes,
        payment_capture: true,
      });
    } catch {
      throw new BadRequestException('Unable to create payment order. Try again.');
    }
  }

  verifyPayment(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const { keySecret } = this.ensureConfigured();
    try {
      return validatePaymentVerification(
        {
          order_id: params.orderId,
          payment_id: params.paymentId,
        },
        params.signature,
        keySecret,
      );
    } catch {
      return false;
    }
  }

  async fetchOrder(orderId: string) {
    const { client } = this.ensureConfigured();
    return client.orders.fetch(orderId);
  }

  async fetchPayment(paymentId: string) {
    const { client } = this.ensureConfigured();
    return client.payments.fetch(paymentId);
  }

  async refundPayment(paymentId: string, amountPaise: number) {
    const { client } = this.ensureConfigured();
    return client.payments.refund(paymentId, { amount: amountPaise });
  }
}
