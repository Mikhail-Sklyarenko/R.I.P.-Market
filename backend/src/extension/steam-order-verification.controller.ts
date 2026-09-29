import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { CurrentExtensionAuth } from './current-extension-auth.decorator';
import { ExtensionSessionGuard } from './guards/extension-session.guard';
import { ExtensionSignatureGuard } from './guards/extension-signature.guard';
import { SignedEnvelopeDto } from './dto/signed-envelope.dto';
import { SteamOrderVerificationService } from './steam-order-verification.service';
@Controller('extension/steam-order-verification')
@UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
export class SteamOrderVerificationController {
  constructor(private readonly service: SteamOrderVerificationService) {}
  @Post('preflight')
  @Header('Cache-Control', 'no-store')
  async preflight(
    @CurrentExtensionAuth() auth: { userId: string },
    @Body() body: SignedEnvelopeDto,
  ) {
    const order = await this.service.authorize(
      auth.userId,
      body.payload.orderId,
    );
    return {
      allowed: true,
      ownerSteamId: order.seller.steamId,
      offerId: order.tradeOperation!.externalOfferId,
    };
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  run(
    @CurrentExtensionAuth() auth: { userId: string },
    @Body() body: SignedEnvelopeDto,
  ) {
    return this.service.run(auth.userId, body.payload);
  }
}
