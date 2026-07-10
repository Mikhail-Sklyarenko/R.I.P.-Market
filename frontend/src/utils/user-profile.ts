import type { AuthUser, UserProfile } from '../api/types';

export function profileToAuthUser(profile: UserProfile): AuthUser {
  return {
    id: profile.id,
    username: profile.username,
    role: profile.role,
    status: profile.status,
    steamId: profile.steamId ?? null,
    steamPersonaName: profile.steamPersonaName ?? null,
    steamAvatarUrl: profile.steamAvatarUrl ?? null,
    tradeUrl: profile.tradeUrl ?? null,
  };
}
