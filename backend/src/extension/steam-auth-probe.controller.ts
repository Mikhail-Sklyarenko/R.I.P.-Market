import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { CurrentExtensionAuth } from './current-extension-auth.decorator';
import { ExtensionSessionGuard } from './guards/extension-session.guard';
import { ExtensionSignatureGuard } from './guards/extension-signature.guard';
import { SignedEnvelopeDto } from './dto/signed-envelope.dto';
import { SteamAuthProbeService } from './steam-auth-probe.service';

@Controller('extension/steam-auth-probe')
@UseGuards(ExtensionSessionGuard, ExtensionSignatureGuard)
export class SteamAuthProbeController {
  constructor(private readonly probe: SteamAuthProbeService) {}

  @Post('preflight')
  @Header('Cache-Control', 'no-store')
  async preflight(@CurrentExtensionAuth() auth: { userId: string }) {
    const ownerSteamId = await this.probe.authorize(auth.userId);
    return { allowed: true, ownerSteamId };
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  run(
    @CurrentExtensionAuth() auth: { userId: string },
    @Body() body: SignedEnvelopeDto,
  ) {
    return this.probe.run(auth.userId, body.payload);
  }
}
