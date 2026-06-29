import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class RestrictUserBodyDto {
  @IsIn([UserStatus.SELL_BLOCK, UserStatus.BUY_BLOCK, UserStatus.SUSPENDED])
  status!: UserStatus;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
