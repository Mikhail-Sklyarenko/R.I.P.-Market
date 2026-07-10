import { Injectable } from '@nestjs/common';

type PlayerSummary = {
  personaname?: string;
  avatarfull?: string;
  communityvisibilitystate?: number;
};

export type SteamPlayerSummary = {
  personaname: string | null;
  avatarUrl: string | null;
};

@Injectable()
export class SteamProfileService {
  async fetchPlayerSummary(steamId64: string): Promise<SteamPlayerSummary> {
    const fromApi = await this.fetchPlayerSummaryFromWebApi(steamId64);
    if (fromApi.personaname || fromApi.avatarUrl) {
      return fromApi;
    }
    const personaFromXml = await this.fetchPersonaNameFromCommunityXml(steamId64);
    return {
      personaname: personaFromXml,
      avatarUrl: null,
    };
  }

  async fetchPersonaName(steamId64: string): Promise<string | null> {
    const summary = await this.fetchPlayerSummary(steamId64);
    return summary.personaname;
  }

  private async fetchPlayerSummaryFromWebApi(
    steamId64: string,
  ): Promise<SteamPlayerSummary> {
    const apiKey = process.env.STEAM_WEB_API_KEY;
    if (!apiKey) {
      return { personaname: null, avatarUrl: null };
    }

    const url = new URL(
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/',
    );
    url.searchParams.set('key', apiKey);
    url.searchParams.set('steamids', steamId64);

    const response = await fetch(url);
    if (!response.ok) {
      return { personaname: null, avatarUrl: null };
    }

    const data = (await response.json()) as {
      response?: { players?: PlayerSummary[] };
    };
    const player = data.response?.players?.[0];

    return {
      personaname: player?.personaname?.trim() || null,
      avatarUrl: player?.avatarfull?.trim() || null,
    };
  }

  private async fetchPersonaNameFromCommunityXml(
    steamId64: string,
  ): Promise<string | null> {
    const url = `https://steamcommunity.com/profiles/${steamId64}/?xml=1`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const xml = await response.text();
    const cdataMatch = xml.match(
      /<steamID><!\[CDATA\[([^\]]+)\]\]><\/steamID>/i,
    );
    if (cdataMatch?.[1]) {
      return cdataMatch[1].trim();
    }

    const plainMatch = xml.match(/<steamID>([^<]+)<\/steamID>/i);
    if (plainMatch?.[1] && !/^\d+$/.test(plainMatch[1])) {
      return plainMatch[1].trim();
    }

    return null;
  }
}
