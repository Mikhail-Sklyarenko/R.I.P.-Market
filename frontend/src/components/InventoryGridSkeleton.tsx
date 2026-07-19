type InventoryGridSkeletonProps = {
  count?: number;
};

/** Placeholder cards so inventory first paint never feels empty while Steam loads. */
export function InventoryGridSkeleton({ count = 12 }: InventoryGridSkeletonProps) {
  return (
    <div
      className="inventory-grid inventory-grid-skeleton"
      data-testid="inventory-grid-skeleton"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="inventory-skeleton-card">
          <div className="inventory-skeleton-image" />
          <div className="inventory-skeleton-line inventory-skeleton-line-title" />
          <div className="inventory-skeleton-line inventory-skeleton-line-meta" />
        </div>
      ))}
    </div>
  );
}
