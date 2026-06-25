export type ApiErrorField = {
  field: string;
  message: string;
};

export type ApiErrorPayload = {
  code: string;
  message: string;
  statusCode: number;
  requestId: string | null;
  details?: Record<string, unknown>;
  fields?: ApiErrorField[];
};

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string | null;
  readonly details?: Record<string, unknown>;
  readonly fields?: ApiErrorField[];

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.statusCode = payload.statusCode;
    this.requestId = payload.requestId;
    this.details = payload.details;
    this.fields = payload.fields;
  }
}

export type AuthConfig = {
  authProvider: 'mock' | 'steam';
  steamLoginAvailable: boolean;
  mockLoginAvailable: boolean;
};

export type AuthUser = {
  id: string;
  username: string;
  role: string;
  status: string;
};

export type AuthResponse = {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
  provider: string;
};

export type ItemDefinition = {
  marketHashName: string;
  weapon?: string;
  rarity?: string;
};

export type InventoryAsset = {
  id: string;
  status: string;
  tradable: boolean;
  tradeLockUntil?: string | null;
  wear?: string;
  itemDefinition: ItemDefinition;
};

export type Lot = {
  id: string;
  status: string;
  priceMinor: string;
  commissionMinor: string;
  sellerReceiveMinor: string;
  createdAt: string;
  inventoryAsset: InventoryAsset;
};

export type PricingPreview = {
  priceMinor: number;
  commissionMinor: number;
  sellerReceiveMinor: number;
};
