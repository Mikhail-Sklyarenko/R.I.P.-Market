import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { steamFetch } from '../common/steam/steam-http.client';
import { getProvidersConfig } from '../providers/config';

type PlayerBanRow = {
  SteamId: string;
  VACBanned: boolean;
  NumberOfGameBans: number;
  CommunityBanned: boolean;
};

type GetPlayerBansResponse = {
  players?: PlayerBanRow[];
};

/** Cache VAC results briefly — bans can appear mid-session. */
const VAC_CACHE_MS = 15 * 60 * 1000;

@Injectable()
export class SteamVacService {
  private readonly logger = new Logger(SteamVacService.name);
  private readonly vacCache = new Map<
    string,
    { banned: boolean; expiresAt: number }
  >();

  /**
   * VAC checks are required when inventory/auth is Steam, or when
   * VAC_CHECK_REQUIRED=true. Without a Steam Web API key the check fails closed
   * in required mode so banned accounts cannot slip through.
   */
  isVacCheckRequired(): boolean {
    if (process.env.VAC_CHECK_REQUIRED === 'true') {
      return true;
    }
    if (process.env.VAC_CHECK_REQUIRED === 'false') {
      return false;
    }
    const providers = getProvidersConfig();
    return providers.inventory === 'steam' || providers.auth === 'steam';
  }

  async assertCanTrade(user: { steamId?: string | null }): Promise<void> {
    if (!user.steamId?.trim()) {
      return;
    }

    const required = this.isVacCheckRequired();
    const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
    if (!apiKey) {
      if (required) {
        throw new AppException(
          ErrorCode.STEAM_VAC_BANNED,
          'VAC check is required but STEAM_WEB_API_KEY is not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return;
    }

    const banned = await this.isVacBanned(user.steamId.trim(), { required });
    if (banned) {
      throw new AppException(
        ErrorCode.STEAM_VAC_BANNED,
        'Accounts with a VAC ban cannot list or buy items on this marketplace',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async isVacBanned(
    steamId: string,
    options?: { required?: boolean },
  ): Promise<boolean> {
    const cached = this.vacCache.get(steamId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.banned;
    }

    const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
    if (!apiKey) {
      return false;
    }

    const required = options?.required ?? this.isVacCheckRequired();
    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId);

    let response: Awaited<ReturnType<typeof steamFetch>>;
    try {
      response = await steamFetch(url);
    } catch (error) {
      this.logger.warn(
        `VAC check request failed for ${steamId}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      if (required) {
        throw new AppException(
          ErrorCode.STEAM_VAC_BANNED,
          'Unable to verify VAC status — try again shortly',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return false;
    }

    if (!response.ok) {
      this.logger.warn(
        `VAC check HTTP ${response.status} for ${steamId}`,
      );
      if (required) {
        throw new AppException(
          ErrorCode.STEAM_VAC_BANNED,
          'Unable to verify VAC status — try again shortly',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return false;
    }

    const payload = (await response.json()) as GetPlayerBansResponse;
    const player = payload.players?.[0];
    if (!player) {
      if (required) {
        throw new AppException(
          ErrorCode.STEAM_VAC_BANNED,
          'Unable to verify VAC status — Steam returned no ban data',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return false;
    }

    const banned = Boolean(
      player.VACBanned || (player.NumberOfGameBans ?? 0) > 0,
    );
    this.vacCache.set(steamId, {
      banned,
      expiresAt: Date.now() + VAC_CACHE_MS,
    });
    return banned;
  }
}
