import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { HttpMetricsService } from './common/observability/http-metrics.service';
import { AppService } from './app.service';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly httpMetrics: HttpMetricsService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('health/metrics')
  getMetrics() {
    return this.appService.getMetrics(this.httpMetrics);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/reconciliation/ledger')
  async reconcileLedger() {
    return this.appService.reconcileLedger();
  }
}
