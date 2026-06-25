import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum MockFailMode {
  SAFE = 'SAFE',
  DISPUTE = 'DISPUTE',
}

export class MockFailDto {
  @IsEnum(MockFailMode)
  mode!: MockFailMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reasonCode?: string;
}
