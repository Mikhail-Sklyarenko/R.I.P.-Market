import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

// Quiet zone required by the QR spec; scanners get unreliable below this.
const QUIET_MODULES = 4;

type QrCodeProps = {
  value: string;
  label: string;
  size?: number;
  className?: string;
  testId?: string;
};

/**
 * Renders a QR code locally as inline SVG.
 *
 * Deposit addresses must never be encoded by a third party: whoever draws the
 * QR decides which wallet the funds go to, and users scan without reading the
 * address underneath.
 */
export function QrCode({ value, label, size = 180, className, testId }: QrCodeProps) {
  const { path, extent } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();

    const modules = qr.getModuleCount();
    const segments: string[] = [];
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) {
          segments.push(`M${col + QUIET_MODULES} ${row + QUIET_MODULES}h1v1h-1z`);
        }
      }
    }

    return { path: segments.join(''), extent: modules + QUIET_MODULES * 2 };
  }, [value]);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-testid={testId}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
