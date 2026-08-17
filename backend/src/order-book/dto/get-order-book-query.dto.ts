import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetOrderBookQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  wear?: string;
}
