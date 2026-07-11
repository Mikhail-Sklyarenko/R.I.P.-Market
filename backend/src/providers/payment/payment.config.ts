export type PaymentProviderKind = 'mock' | 'crypto_tron';

export type PaymentConfig = {
  provider: PaymentProviderKind;
  gatewayUrl: string;
  gatewayApiKey: string;
  webhookSecret: string;
  minDepositMinor: number;
  minWithdrawMinor: number;
  withdrawFeeMinor: number;
  withdrawManualReview: boolean;
  withdrawManualReviewCount: number;
  withdrawRequireSteamLinked: boolean;
  withdrawMinCompletedSales: number;
  withdrawDailyCapMinor: number;
  mockDepositEnabled: boolean;
};

export function getPaymentConfig(): PaymentConfig {
  const provider: PaymentProviderKind =
    process.env.PAYMENT_PROVIDER === 'crypto_tron' ? 'crypto_tron' : 'mock';

  return {
    provider,
    gatewayUrl: process.env.CRYPTO_GATEWAY_URL ?? 'http://localhost:3100',
    gatewayApiKey: process.env.CRYPTO_GATEWAY_API_KEY ?? '',
    webhookSecret: process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET ?? '',
    minDepositMinor: Math.max(
      100,
      Number(process.env.MIN_DEPOSIT_MINOR ?? 500) || 500,
    ),
    minWithdrawMinor: Math.max(
      100,
      Number(process.env.MIN_WITHDRAW_MINOR ?? 2000) || 2000,
    ),
    withdrawFeeMinor: Math.max(
      0,
      Number(process.env.WITHDRAW_FEE_MINOR ?? 200) || 200,
    ),
    withdrawManualReview: process.env.WITHDRAW_MANUAL_REVIEW !== 'false',
    withdrawManualReviewCount: Math.max(
      0,
      Number(process.env.WITHDRAW_MANUAL_REVIEW_COUNT ?? 3) || 3,
    ),
    withdrawRequireSteamLinked:
      process.env.WITHDRAW_REQUIRE_STEAM_LINKED !== 'false',
    withdrawMinCompletedSales: Math.max(
      0,
      Number(process.env.WITHDRAW_MIN_COMPLETED_SALES ?? 0) || 0,
    ),
    withdrawDailyCapMinor: Math.max(
      0,
      Number(process.env.WITHDRAW_DAILY_CAP_MINOR ?? 0) || 0,
    ),
    mockDepositEnabled: process.env.ENABLE_MOCK_DEPOSIT !== 'false',
  };
}

export function isCryptoPaymentProvider(): boolean {
  return getPaymentConfig().provider === 'crypto_tron';
}
