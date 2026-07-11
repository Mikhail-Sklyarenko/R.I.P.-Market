import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TradeTaskExecutionPhase } from '@prisma/client';

export class ReportTaskProgressPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  taskId!: string;

  @IsEnum(TradeTaskExecutionPhase)
  phase!: TradeTaskExecutionPhase;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  offerId?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
