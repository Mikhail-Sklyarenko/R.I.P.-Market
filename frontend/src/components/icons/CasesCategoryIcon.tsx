type CasesCategoryIconProps = {
  className?: string;
};

/**
 * CS2 weapon case silhouette tuned for 18px category tabs.
 * Bold Gallery frame + Revolution lid split; no hairline strokes or low opacity.
 */
export function CasesCategoryIcon({ className }: CasesCategoryIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g fill="#FFFFFF">
        {/* Right depth panel */}
        <path d="M22.2 12.6 25.8 11.2V23.8l-3.6 1.4V12.6z" />
        {/* Lid top with diagonal split (Revolution accent via negative space) */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M5.4 10.9 16 7.1 26.6 10.9 15.5 13.5 5.4 10.9M17 8.6 24.2 10.8 23.3 12.1 16.1 9.9 17 8.6z"
        />
        {/* Lid front band */}
        <path d="M5.4 10.9h17.2v1.9H5.4V10.9z" />
        {/* Main front body */}
        <path d="M5.4 12.8h17.2v11.6c0 1.1-.9 2-2 2H7.4c-1.1 0-2-.9-2-2V12.8z" />
        {/* Gallery picture frame (2px ring at 32 viewBox) */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.8 14.4h12.4v8.4H7.8V14.4Zm2.4 2.2h7.6v4H10.2v-4z"
        />
        {/* Center latch */}
        <path d="M12.8 20.8h6.4v3.2H12.8v-3.2z" />
      </g>
    </svg>
  );
}
