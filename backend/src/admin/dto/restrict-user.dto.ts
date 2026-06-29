import { IsIn } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class RestrictUserDto {
  @IsIn([UserStatus.SELL_BLOCK, UserStatus.BUY_BLOCK, UserStatus.SUSPENDED])
  status!: UserStatus;
}
