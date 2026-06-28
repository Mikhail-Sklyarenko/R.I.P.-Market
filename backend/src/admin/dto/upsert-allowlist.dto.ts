import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAllowlistEntryDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  maxOrderMinor?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  note?: string;
}
