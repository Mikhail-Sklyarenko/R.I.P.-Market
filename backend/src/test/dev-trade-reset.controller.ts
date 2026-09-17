import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevTradeResetService } from './dev-trade-reset.service';

function isDevTradeResetEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_MOCK_TRADE === 'true'
  );
}

/**
 * Seller/admin helper to clean mock trade residue. Kept outside TestModule so
 * ENABLE_MOCK_TRADE does not load DB-wipe / mint-JWT routes.
 */
@ApiTags('test')
@Controller('test')
export class DevTradeResetController {
  constructor(private readonly devTradeResetService: DevTradeResetService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('reset-dev-trades')
  async resetDevTrades(@CurrentUser() user: AuthUser) {
    if (!isDevTradeResetEnabled()) {
      return { ok: false, reason: 'disabled' };
    }
    if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
      return { ok: false, reason: 'seller_or_admin_required' };
    }
    return this.devTradeResetService.resetForSeller(user.sub);
  }
}
