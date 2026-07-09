import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OpenDisputeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}
