import { Body, Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { toJsonSafe } from '../common/json-safe.util';
import { PrismaService } from '../prisma/prisma.service';
import { isRealSettlementEnabled } from './settlement.config';
import { SettlementGuardService } from './settlement-guard.service';

@ApiTags('settlement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settlement')
export class SettlementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: SettlementGuardService,
  ) {}

  @Get('my-eligibility')
  async getMyEligibility(@CurrentUser() user: AuthUser) {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { steamId: true },
    });

    const enabled = isRealSettlementEnabled();
    const allowlisted = profile?.steamId
      ? await this.guard.isSteamIdAllowlisted(profile.steamId)
      : false;

    return toJsonSafe({
      realSettlementEnabled: enabled,
      steamId: profile?.steamId ?? null,
      allowlisted,
      bannerVisible: enabled && allowlisted,
    });
  }
}
