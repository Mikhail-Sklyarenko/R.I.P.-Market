import { UserRole, UserStatus } from '@prisma/client';

export interface AuthUser {
  sub: string;
  role: UserRole;
  status: UserStatus;
}
