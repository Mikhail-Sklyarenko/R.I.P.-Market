import { IsObject } from 'class-validator';

export class SteamLinkDto {
  @IsObject()
  openidParams!: Record<string, string>;
}
