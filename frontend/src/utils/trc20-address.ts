const TRC20_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidTrc20Address(address: string): boolean {
  return TRC20_ADDRESS_RE.test(address.trim());
}

export function getTrc20AddressError(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) {
    return 'Укажите TRC-20 адрес получателя.';
  }
  if (!trimmed.startsWith('T')) {
    return 'TRC-20 адрес должен начинаться с T.';
  }
  if (!isValidTrc20Address(trimmed)) {
    return 'Некорректный TRC-20 адрес.';
  }
  return null;
}
