import { STEAM_TRADE_URL_SETTINGS } from '../utils/trade-url';

type SteamTradeUrlButtonProps = {
  className?: string;
  label?: string;
};

export function SteamTradeUrlButton({
  className = 'button secondary sm',
  label = 'Получить ссылку',
}: SteamTradeUrlButtonProps) {
  return (
    <a
      href={STEAM_TRADE_URL_SETTINGS}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid="steam-trade-url-settings-link"
    >
      {label}
    </a>
  );
}
