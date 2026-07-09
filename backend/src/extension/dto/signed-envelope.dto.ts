import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SignedEnvelopeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  nonce!: string;

  @IsInt()
  @Min(0)
  timestampMs!: number;

  @IsInt()
  @Min(1)
  @Max(15_000)
  ttlMs!: number;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  signature!: string;
}
