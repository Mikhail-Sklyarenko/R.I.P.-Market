import { useEffect, useState } from 'react';
import {
  ITEM_IMAGE_PLACEHOLDER_DATA,
  getSteamItemImageUrl,
} from '../utils/item-image';

type SteamItemImageProps = {
  iconUrl?: string | null;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  'data-testid'?: string;
};

/**
 * Renders a Steam CDN item icon with a stable placeholder if the URL is
 * missing or fails to load (broken CDN hashes otherwise look like "no image").
 */
export function SteamItemImage({
  iconUrl,
  alt,
  className,
  loading = 'lazy',
  'data-testid': testId,
}: SteamItemImageProps) {
  const resolved = getSteamItemImageUrl(iconUrl);
  const [src, setSrc] = useState(resolved);

  useEffect(() => {
    setSrc(resolved);
  }, [resolved]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      data-testid={testId}
      onError={() => {
        setSrc((current) =>
          current === ITEM_IMAGE_PLACEHOLDER_DATA
            ? current
            : ITEM_IMAGE_PLACEHOLDER_DATA,
        );
      }}
    />
  );
}
