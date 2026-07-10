export function InventorySellPlaceholder() {
  return (
    <div className="card inventory-sell-placeholder" data-testid="inventory-sell-placeholder">
      <p className="inventory-sell-placeholder-title">Выберите предмет</p>
      <p className="inventory-sell-placeholder-text muted small">
        Кликните по доступному предмету в инвентаре, укажите цену и выставьте лот.
      </p>
    </div>
  );
}
