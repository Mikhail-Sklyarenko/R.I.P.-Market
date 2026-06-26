import { Injectable } from '@nestjs/common';

type PlayerSummary = {
  personaname?: string;
  communityvisibilitystate?: number;
};

@Injectable()
export class SteamProfileService {
  async fetchPersonaName(steamId64: string): Promise<string | null> {
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      return null;
    }

    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId64);

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      response?: { players?: PlayerSummary[] };
    };
    const player = data.response?.players?.[0];
    if (!player?.personaname) {
      return null;
    }

    return player.personaname;
  }
}
