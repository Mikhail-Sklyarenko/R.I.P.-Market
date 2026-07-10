export function EscrowNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="checkout-footnote" data-testid="escrow-notice">
        Средства резервируются до подтверждения обмена в Steam.
      </p>
    );
  }

  return (
    <p className="escrow-notice" data-testid="escrow-notice">
      Деньги будут зарезервированы до подтверждения передачи предмета в Steam. После
      подтверждения средства переводятся продавцу.
    </p>
  );
}
