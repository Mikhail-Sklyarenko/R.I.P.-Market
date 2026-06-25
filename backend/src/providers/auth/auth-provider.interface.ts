import { UserRole, UserStatus } from '@prisma/client';

export type AuthProviderType = 'mock' | 'steam';

export type AuthLoginResult = {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
};

export type MockAuthLoginParams = {
  kind: 'mock';
  role: UserRole;
};

export type SteamAuthCallbackParams = {
  kind: 'steam';
  claimedId: string;
  identity: string;
};

export type AuthLoginParams = MockAuthLoginParams | SteamAuthCallbackParams;

export interface AuthProvider {
  readonly type: AuthProviderType;
  login(params: AuthLoginParams): Promise<AuthLoginResult>;
  getSteamLoginUrl?(returnUrl: string): string;
}
