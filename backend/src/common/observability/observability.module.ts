import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpMetricsService } from './http-metrics.service';
import { RequestIdMiddleware } from './request-id.middleware';
import { StructuredLoggingInterceptor } from './structured-logging.interceptor';

@Global()
@Module({
  providers: [
    HttpMetricsService,
    RequestIdMiddleware,
    StructuredLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: StructuredLoggingInterceptor,
    },
  ],
  exports: [HttpMetricsService, RequestIdMiddleware],
})
export class ObservabilityModule {}
