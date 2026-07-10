import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { getRequestId } from '../observability/audit-context';
import { ApiErrorBody } from './app.exception';
import { ErrorCode } from './error-codes';
import { AppException } from './app.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId() ?? request.header('x-request-id') ?? null;

    const body = this.toErrorBody(exception, requestId);

    if (body.statusCode >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_exception',
          path: request.originalUrl,
          ...body,
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    response.status(body.statusCode).json({ error: body });
  }

  private toErrorBody(
    exception: unknown,
    requestId: string | null,
  ): ApiErrorBody {
    if (exception instanceof AppException) {
      return {
        code: exception.code,
        message: exception.message,
        statusCode: exception.getStatus(),
        requestId,
        details: exception.details,
        fields: exception.fields,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception, requestId);
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, requestId);
    }

    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
    };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    requestId: string | null,
  ): ApiErrorBody {
    if (exception.code === 'P2025') {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Record not found',
        statusCode: HttpStatus.NOT_FOUND,
        requestId,
      };
    }

    if (exception.code === 'P2003') {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Related record not found',
        statusCode: HttpStatus.NOT_FOUND,
        requestId,
      };
    }

    return {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
    };
  }

  private fromHttpException(
    exception: HttpException,
    requestId: string | null,
  ): ApiErrorBody {
    const statusCode = exception.getStatus();
    const raw = exception.getResponse();

    if (statusCode === Number(HttpStatus.UNAUTHORIZED)) {
      return {
        code: ErrorCode.UNAUTHORIZED,
        message: this.extractMessage(raw) ?? 'Unauthorized',
        statusCode,
        requestId,
      };
    }

    if (statusCode === Number(HttpStatus.FORBIDDEN)) {
      return {
        code: ErrorCode.FORBIDDEN,
        message: this.extractMessage(raw) ?? 'Forbidden',
        statusCode,
        requestId,
      };
    }

    if (statusCode === Number(HttpStatus.NOT_FOUND)) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: this.extractMessage(raw) ?? 'Not found',
        statusCode,
        requestId,
      };
    }

    if (
      statusCode === Number(HttpStatus.BAD_REQUEST) &&
      typeof raw === 'object' &&
      raw !== null
    ) {
      const payload = raw as { message?: unknown };
      if (Array.isArray(payload.message)) {
        return {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          statusCode,
          requestId,
          fields: payload.message.map((entry) =>
            this.parseValidationEntry(entry),
          ),
        };
      }
    }

    return {
      code:
        statusCode >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST,
      message: this.extractMessage(raw) ?? exception.message,
      statusCode,
      requestId,
    };
  }

  private extractMessage(raw: string | object): string | undefined {
    if (typeof raw === 'string') {
      return raw;
    }
    if (typeof raw === 'object' && raw !== null && 'message' in raw) {
      const message = raw.message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
    }
    return undefined;
  }

  private parseValidationEntry(entry: unknown): {
    field: string;
    message: string;
  } {
    if (typeof entry === 'string') {
      return { field: 'body', message: entry };
    }
    return { field: 'body', message: String(entry) };
  }
}
