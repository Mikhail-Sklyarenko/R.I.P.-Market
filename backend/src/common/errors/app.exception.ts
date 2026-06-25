import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeType } from './error-codes';

export type ApiErrorField = {
  field: string;
  message: string;
};

export type ApiErrorBody = {
  code: ErrorCodeType;
  message: string;
  statusCode: number;
  requestId: string | null;
  details?: Record<string, unknown>;
  fields?: ApiErrorField[];
};

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
    public readonly fields?: ApiErrorField[],
  ) {
    super(message, statusCode);
  }
}
