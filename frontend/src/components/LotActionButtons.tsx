type LotActionButtonsProps = {
  inspectLink?: string | null;
  steamMarketUrl?: string | null;
  /** Exact Steam market_hash_name (incl. wear) — shown on hover / for clarity */
  steamMarketHashName?: string | null;
};

function InspectInGameIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
      <path
        d="M10 4.5c-3.2 0-5.9 1.8-7.2 4.5 1.3 2.7 4 4.5 7.2 4.5s5.9-1.8 7.2-4.5C15.9 6.3 13.2 4.5 10 4.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function SteamMarketIcon() {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} aria-hidden="true">
      <path
        d="M4.5 5.5h11v9h-11v-9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 8.5h5M7.5 11.5h3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M13.5 4.5 15 3l1 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LotActionButtons({
  inspectLink,
  steamMarketUrl,
  steamMarketHashName,
}: LotActionButtonsProps) {
  if (!inspectLink && !steamMarketUrl) {
    return null;
  }

  const marketTitle = steamMarketHashName?.trim() || undefined;

  return (
    <div className="lot-action-buttons" data-testid="lot-action-buttons">
      {inspectLink ? (
        <a
          href={inspectLink}
          className="lot-action-button"
          data-testid="lot-inspect-link"
        >
          <InspectInGameIcon />
          <span>Осмотр в игре</span>
        </a>
      ) : null}
      {steamMarketUrl ? (
        <a
          href={steamMarketUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="lot-action-button"
          data-testid="lot-steam-market-link"
          title={marketTitle}
          aria-label={
            marketTitle
              ? `Открыть в Steam Маркете: ${marketTitle}`
              : 'Открыть в Steam Маркете'
          }
        >
          <SteamMarketIcon />
          <span>Steam Маркет</span>
        </a>
      ) : null}
    </div>
  );
}
