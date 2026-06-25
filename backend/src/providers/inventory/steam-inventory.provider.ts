import { Injectable, NotImplementedException } from '@nestjs/common';
import { InventoryProvider } from './inventory-provider.interface';

@Injectable()
export class SteamInventoryProvider implements InventoryProvider {
  readonly type = 'steam' as const;

  ensureInventoryForUser(): Promise<void> {
    return Promise.reject(
      new NotImplementedException(
        'Steam inventory sync is not wired yet. Requires Steam Web API key and user session. See docs/steam-spike.md.',
      ),
    );
  }
}
