import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { AntiFraudRuleService } from './anti-fraud.service';
import { ExtensionFlowMetricsService } from './extension-flow-metrics.service';
import { ExtensionRateLimitService } from './extension-rate-limit.service';
import { HttpMetricsService } from './http-metrics.service';
import { ObservabilityAlertService } from './observability-alert.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { StructuredLoggingInterceptor } from './structured-logging.interceptor';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    HttpMetricsService,
    ExtensionFlowMetricsService,
    ObservabilityAlertService,
    AntiFraudRuleService,
    ExtensionRateLimitService,
    RequestIdMiddleware,
    StructuredLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: StructuredLoggingInterceptor,
    },
  ],
  exports: [
    HttpMetricsService,
    ExtensionFlowMetricsService,
    ObservabilityAlertService,
    AntiFraudRuleService,
    ExtensionRateLimitService,
    RequestIdMiddleware,
  ],
})
export class ObservabilityModule {}
