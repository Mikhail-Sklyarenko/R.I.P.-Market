import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class MockLoginDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
