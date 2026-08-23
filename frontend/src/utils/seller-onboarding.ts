const SELLER_ONBOARDING_COMPLETE_KEY = 'rip_market_seller_onboarding_complete';

export function isSellerOnboardingMarkedComplete(): boolean {
  try {
    return window.localStorage.getItem(SELLER_ONBOARDING_COMPLETE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSellerOnboardingComplete(): void {
  try {
    window.localStorage.setItem(SELLER_ONBOARDING_COMPLETE_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}
