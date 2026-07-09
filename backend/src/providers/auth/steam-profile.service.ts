import { Injectable } from '@nestjs/common';

type PlayerSummary = {
  personaname?: string;
  communityvisibilitystate?: number;
};

@Injectable()
export class SteamProfileService {
  async fetchPersonaName(steamId64: string): Promise<string | null> {
    const fromApi = await this.fetchPersonaNameFromWebApi(steamId64);
    if (fromApi) {
      return fromApi;
    }
    return this.fetchPersonaNameFromCommunityXml(steamId64);
  }

  private async fetchPersonaNameFromWebApi(
    steamId64: string,
  ): Promise<string | null> {
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
