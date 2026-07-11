import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { PaymentWebhookPayload } from '../providers/payment/payment-provider.interface';
import { PAYMENT_PROVIDER } from '../providers/tokens';
import type { PaymentProvider } from '../providers/payment/payment-provider.interface';
import { Inject } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  @Post('crypto')
  async handleCryptoWebhook(
    @Req() req: Request & { rawBody?: string },
    @Headers('x-gateway-signature') signature?: string,
    @Body() body?: PaymentWebhookPayload,
  ) {
    const rawBody = req.rawBody ?? (body ? JSON.stringify(body) : '');

    if (!this.paymentProvider.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid gateway signature');
    }

    if (!body?.eventId || !body?.type) {
      throw new BadRequestException('Invalid webhook payload');
    }

    return this.paymentsService.handleWebhook(rawBody, body);
  }
}
