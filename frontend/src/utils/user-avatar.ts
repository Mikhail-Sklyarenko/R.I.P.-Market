import type { AuthUser } from '../api/types';

export function getUserDisplayName(user: AuthUser): string {
  return user.steamPersonaName?.trim() || user.username.trim();
}

export function getUserAvatarUrl(user: AuthUser): string | null {
  const url = user.steamAvatarUrl?.trim();
  return url || null;
}

export function getUserInitials(user: AuthUser): string {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}
