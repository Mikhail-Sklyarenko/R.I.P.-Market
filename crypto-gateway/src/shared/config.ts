import 'dotenv/config';

export type GatewayConfig = {
  port: number;
  apiKey: string;
  webhookSecret: string;
  webhookUrl: string;
  usdtContract: string;
  minConfirmations: number;
  minDepositSun: bigint;
  tronGridApiKey: string;
  tronGridBaseUrl: string;
  hotWalletAddress: string;
  sweepIntervalHours: number;
  withdrawalFeeSun: bigint;
  maxWithdrawalSun: bigint;
  mnemonic: string;
  xpub: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalBigInt(name: string, fallback: string): bigint {
  const raw = process.env[name] ?? fallback;
  return BigInt(raw);
}

export function loadConfig(): GatewayConfig {
  return {
    port: Number(process.env.PORT ?? 3100),
    apiKey: requireEnv('API_KEY'),
    webhookSecret: requireEnv('WEBHOOK_SECRET'),
    webhookUrl: requireEnv('WEBHOOK_URL'),
    usdtContract: process.env.USDT_CONTRACT ?? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    minConfirmations: Math.max(1, Number(process.env.MIN_CONFIRMATIONS ?? 19)),
    minDepositSun: optionalBigInt('MIN_DEPOSIT_SUN', '1000000'),
    tronGridApiKey: process.env.TRON_GRID_API_KEY ?? '',
    tronGridBaseUrl: process.env.TRON_GRID_BASE_URL ?? 'https://api.trongrid.io',
    hotWalletAddress: process.env.HOT_WALLET_ADDRESS ?? '',
    sweepIntervalHours: Math.max(1, Number(process.env.SWEEP_INTERVAL_HOURS ?? 6)),
    withdrawalFeeSun: optionalBigInt('WITHDRAWAL_FEE_SUN', '0'),
    maxWithdrawalSun: optionalBigInt('MAX_WITHDRAWAL_SUN', '100000000000'),
    mnemonic: process.env.MNEMONIC ?? '',
    xpub: process.env.XPUB ?? '',
  };
}

export function loadApiConfig(): Pick<
  GatewayConfig,
  | 'port'
  | 'apiKey'
  | 'webhookSecret'
  | 'webhookUrl'
  | 'usdtContract'
  | 'minConfirmations'
  | 'minDepositSun'
  | 'tronGridApiKey'
  | 'tronGridBaseUrl'
  | 'xpub'
> {
  const config = loadConfig();
  return {
    port: config.port,
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret,
    webhookUrl: config.webhookUrl,
    usdtContract: config.usdtContract,
    minConfirmations: config.minConfirmations,
    minDepositSun: config.minDepositSun,
    tronGridApiKey: config.tronGridApiKey,
    tronGridBaseUrl: config.tronGridBaseUrl,
    xpub: config.xpub,
  };
}

export function loadSignerConfig(): Pick<
  GatewayConfig,
  | 'mnemonic'
  | 'hotWalletAddress'
  | 'sweepIntervalHours'
  | 'withdrawalFeeSun'
  | 'maxWithdrawalSun'
  | 'usdtContract'
  | 'tronGridApiKey'
  | 'tronGridBaseUrl'
> {
  const config = loadConfig();
  if (!config.mnemonic) {
    throw new Error('MNEMONIC is required for signer process');
  }
  if (!config.hotWalletAddress) {
    throw new Error('HOT_WALLET_ADDRESS is required for signer process');
  }
  return {
    mnemonic: config.mnemonic,
    hotWalletAddress: config.hotWalletAddress,
    sweepIntervalHours: config.sweepIntervalHours,
    withdrawalFeeSun: config.withdrawalFeeSun,
    maxWithdrawalSun: config.maxWithdrawalSun,
    usdtContract: config.usdtContract,
    tronGridApiKey: config.tronGridApiKey,
    tronGridBaseUrl: config.tronGridBaseUrl,
  };
}
