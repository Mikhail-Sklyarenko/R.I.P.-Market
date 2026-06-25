import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export enum DisputeResolution {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
}

export class ResolveDisputeDto {
  @IsEnum(DisputeResolution)
  resolution!: DisputeResolution;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
