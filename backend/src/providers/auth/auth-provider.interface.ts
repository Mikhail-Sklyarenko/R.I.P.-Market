import { UserRole, UserStatus } from '@prisma/client';

export type AuthProviderType = 'mock' | 'steam';

export type AuthLoginResult = {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  steamId?: string | null;
};

export type MockAuthLoginParams = {
  kind: 'mock';
  role: UserRole;
};

export type SteamAuthCallbackParams = {
  kind: 'steam';
  openidParams: Record<string, string>;
};

export type AuthLoginParams = MockAuthLoginParams | SteamAuthCallbackParams;

export interface AuthProvider {
  readonly type: AuthProviderType;
  login(params: AuthLoginParams): Promise<AuthLoginResult>;
  getSteamLoginUrl?(returnUrl: string): string;
}
