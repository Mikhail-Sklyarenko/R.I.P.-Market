import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';
import { LotStatus } from '@prisma/client';

export class ListAdminLotsQueryDto {
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit?: number;
}
