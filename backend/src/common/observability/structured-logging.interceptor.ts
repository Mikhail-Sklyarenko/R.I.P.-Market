import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { getRequestId } from './audit-context';
import { HttpMetricsService } from './http-metrics.service';

@Injectable()
export class StructuredLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  constructor(private readonly httpMetrics: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestId = getRequestId() ?? req.header('x-request-id') ?? null;

    return next.handle().pipe(
      tap({
        next: () => this.logOutcome(req, res.statusCode, startedAt, requestId),
        error: (error: { status?: number; message?: string }) => {
          const statusCode = error?.status ?? 500;
          this.logOutcome(
            req,
            statusCode,
            startedAt,
            requestId,
            error?.message,
          );
        },
      }),
    );
  }

  private logOutcome(
    req: Request,
    statusCode: number,
    startedAt: number,
    requestId: string | null,
    errorMessage?: string,
  ): void {
    const durationMs = Date.now() - startedAt;
    this.httpMetrics.record(statusCode);

    const payload = {
      level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs,
      ...(errorMessage ? { error: errorMessage } : {}),
    };

    this.logger.log(JSON.stringify(payload));
  }
}
