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

type BanVerdict =
  | { kind: 'clear' }
  | { kind: 'vac_banned' }
  | { kind: 'game_banned' };

/** Cache successful ban verdicts briefly — bans can appear mid-session. */
const VAC_CACHE_MS = 15 * 60 * 1000;
const BAN_CHECK_RETRY_ATTEMPTS = 2;
const BAN_CHECK_RETRY_DELAY_MS = 350;

@Injectable()
export class SteamVacService {
  private readonly logger = new Logger(SteamVacService.name);
  private readonly vacCache = new Map<
    string,
    { verdict: BanVerdict; expiresAt: number }
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
          ErrorCode.STEAM_BAN_CHECK_UNAVAILABLE,
          'Ban check is required but STEAM_WEB_API_KEY is not configured',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return;
    }

    const verdict = await this.resolveBanVerdict(user.steamId.trim(), {
      required,
    });
    if (verdict.kind === 'vac_banned') {
      throw new AppException(
        ErrorCode.STEAM_VAC_BANNED,
        'Accounts with a VAC ban cannot list or buy items on this marketplace',
        HttpStatus.FORBIDDEN,
      );
    }
    if (verdict.kind === 'game_banned') {
      throw new AppException(
        ErrorCode.STEAM_GAME_BANNED,
        'Accounts with a Steam game ban cannot list or buy items on this marketplace',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * @deprecated Prefer resolveBanVerdict — kept for callers that only need VAC flag.
   */
  async isVacBanned(
    steamId: string,
    options?: { required?: boolean },
  ): Promise<boolean> {
    const verdict = await this.resolveBanVerdict(steamId, options);
    return verdict.kind === 'vac_banned';
  }

  async resolveBanVerdict(
    steamId: string,
    options?: { required?: boolean },
  ): Promise<BanVerdict> {
    const cached = this.vacCache.get(steamId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.verdict;
    }

    const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
    if (!apiKey) {
      return { kind: 'clear' };
    }

    const required = options?.required ?? this.isVacCheckRequired();
    let lastFailure: string | null = null;

    for (let attempt = 1; attempt <= BAN_CHECK_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const verdict = await this.fetchBanVerdictOnce(steamId, apiKey);
        this.vacCache.set(steamId, {
          verdict,
          expiresAt: Date.now() + VAC_CACHE_MS,
        });
        return verdict;
      } catch (error) {
        lastFailure =
          error instanceof Error ? error.message : 'unknown ban-check failure';
        this.logger.warn(
          `Ban check attempt ${attempt}/${BAN_CHECK_RETRY_ATTEMPTS} failed for ${steamId}: ${lastFailure}`,
        );
        if (attempt < BAN_CHECK_RETRY_ATTEMPTS) {
          await sleep(BAN_CHECK_RETRY_DELAY_MS * attempt);
        }
      }
    }

    if (required) {
      throw new AppException(
        ErrorCode.STEAM_BAN_CHECK_UNAVAILABLE,
        lastFailure?.includes('no ban data')
          ? 'Unable to verify Steam ban status — Steam returned no ban data'
          : 'Unable to verify Steam ban status — try again shortly',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { kind: 'clear' };
  }

  private async fetchBanVerdictOnce(
    steamId: string,
    apiKey: string,
  ): Promise<BanVerdict> {
    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId);

    let response: Awaited<ReturnType<typeof steamFetch>>;
    try {
      response = await steamFetch(url);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'ban check request failed',
      );
    }

    if (!response.ok) {
      throw new Error(`ban check HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GetPlayerBansResponse;
    const player = payload.players?.[0];
    if (!player) {
      throw new Error('Steam returned no ban data');
    }

    if (player.VACBanned) {
      return { kind: 'vac_banned' };
    }
    if ((player.NumberOfGameBans ?? 0) > 0) {
      return { kind: 'game_banned' };
    }
    return { kind: 'clear' };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
