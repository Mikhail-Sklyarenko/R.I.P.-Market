import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

type PlayerBanRow = {
  SteamId: string;
  VACBanned: boolean;
  NumberOfGameBans: number;
  CommunityBanned: boolean;
};

type GetPlayerBansResponse = {
  players?: PlayerBanRow[];
};

const VAC_CACHE_MS = 60 * 60 * 1000;

@Injectable()
export class SteamVacService {
  private readonly vacCache = new Map<string, { banned: boolean; expiresAt: number }>();

  async assertCanTrade(user: { steamId?: string | null }): Promise<void> {
    if (!user.steamId?.trim()) {
      return;
    }
    const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
    if (!apiKey) {
      return;
    }

    const banned = await this.isVacBanned(user.steamId.trim());
    if (banned) {
      throw new AppException(
        ErrorCode.STEAM_VAC_BANNED,
        'Accounts with a VAC ban cannot list or buy items on this marketplace',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async isVacBanned(steamId: string): Promise<boolean> {
    const cached = this.vacCache.get(steamId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.banned;
    }

    const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
    if (!apiKey) {
      return false;
    }

    const url = new URL('https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId);

    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as GetPlayerBansResponse;
    const player = payload.players?.[0];
    const banned = Boolean(player?.VACBanned || (player?.NumberOfGameBans ?? 0) > 0);
    this.vacCache.set(steamId, { banned, expiresAt: Date.now() + VAC_CACHE_MS });
    return banned;
  }
}
