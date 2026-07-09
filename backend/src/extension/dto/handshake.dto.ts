import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExtensionHandshakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  publicKey!: string;
}
