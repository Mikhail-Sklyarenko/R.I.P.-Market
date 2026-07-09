import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

export class AckCommandPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  commandId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  status!: string;

  @IsObject()
  result!: Record<string, unknown>;
}
