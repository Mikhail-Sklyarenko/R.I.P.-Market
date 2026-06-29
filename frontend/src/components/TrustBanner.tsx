export function TrustBanner() {
  return (
    <div className="card trust-banner" data-testid="trust-banner">
      <h3>Безопасная сделка</h3>
      <p className="muted small">
        Средства резервируются на вашем кошельке (hold) и переводятся продавцу только
        после подтверждения передачи предмета в Steam. До этого момента вы можете
        отменить сделку.
      </p>
    </div>
  );
}
