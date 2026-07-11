import { signatureMessage } from '../crypto/signature.js';
import type { PolledTradeTask, TaskProgressReport } from '../types.js';
import type {
  TradeAcknowledgmentType,
  TradeVerificationResult,
} from '../trade-verification.types.js';

export class ExtensionApiError extends Error {
  readonly path: string;
  readonly status: number;
  readonly code?: string;

  constructor(path: string, status: number, message: string, code?: string) {
    super(`Extension API ${path} failed: ${status} ${message}`);
    this.name = 'ExtensionApiError';
    this.path = path;
    this.status = status;
    this.code = code;
  }
}

export function parseExtensionApiError(
  path: string,
  status: number,
  text: string,
): ExtensionApiError {
  try {
    const body = JSON.parse(text) as {
      error?: { code?: string; message?: string };
    };
    const code = body.error?.code;
    const message = body.error?.message ?? text;
    return new ExtensionApiError(path, status, message, code);
  } catch {
    return new ExtensionApiError(path, status, text);
  }
}

const EXTENSION_AUTH_ERROR_CODES = new Set([
  'EXTENSION_SESSION_REVOKED',
  'EXTENSION_SESSION_INVALID',
  'EXTENSION_TOKEN_EXPIRED',
  'EXTENSION_DEVICE_MISMATCH',
]);

export function isExtensionAuthError(error: unknown): boolean {
  if (!(error instanceof ExtensionApiError)) {
    return false;
  }
  if (error.status !== 401) {
    return false;
  }
  return !error.code || EXTENSION_AUTH_ERROR_CODES.has(error.code);
}

export type ExtensionSession = {
  sessionId: string;
  deviceId: string;
  accessToken: string;
  expiresAt: string;
};

export type SignMessageFn = (message: string) => Promise<string>;

export type SignedEnvelope = {
  deviceId: string;
  nonce: string;
  timestampMs: number;
  ttlMs: number;
  payload: Record<string, unknown>;
  signature: string;
};

/** Match JSON serialization: drop undefined so signed payload equals request body. */
export function jsonSafePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

export class ExtensionApiClient {
  constructor(
    private readonly apiBaseUrl: string,
    private session: ExtensionSession,
    private readonly signMessage: SignMessageFn,
  ) {}

  getSession(): ExtensionSession {
    return this.session;
  }

  updateSession(session: ExtensionSession): void {
    this.session = session;
  }

  async handshake(params: {
    userJwt: string;
    deviceId: string;
    publicKeyPem: string;
  }): Promise<ExtensionSession> {
    const response = await fetch(`${this.apiBaseUrl}/extension/handshake`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.userJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deviceId: params.deviceId,
        publicKey: params.publicKeyPem,
      }),
    });
    if (!response.ok) {
      throw new Error(`Handshake failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      sessionId: string;
      deviceId: string;
      accessToken: string;
      expiresAt: string;
    };
    this.session = {
      sessionId: body.sessionId,
      deviceId: body.deviceId,
      accessToken: body.accessToken,
      expiresAt: body.expiresAt,
    };
    return this.session;
  }

  async heartbeat(): Promise<void> {
    await this.signedPost('/extension/heartbeat', { ping: true });
  }

  async pollTasks(limit = 10): Promise<PolledTradeTask[]> {
    const body = await this.signedPost<{ tasks: PolledTradeTask[] }>(
      '/extension/tasks/poll',
      { limit },
    );
    return body.tasks ?? [];
  }

  async reportTaskProgress(
    progress: TaskProgressReport,
  ): Promise<{ ok: boolean; phase: string; terminal: boolean }> {
    return this.signedPost('/extension/tasks/progress', {
      taskId: progress.taskId,
      phase: progress.phase,
      idempotencyKey: progress.idempotencyKey,
      reasonCode: progress.reasonCode,
      offerId: progress.offerId,
      details: progress.details,
    });
  }

  async rotateSession(): Promise<ExtensionSession> {
    const body = await this.signedPost<{
      sessionId: string;
      accessToken: string;
      expiresAt: string;
    }>('/extension/session/rotate', {});
    this.session = {
      sessionId: body.sessionId,
      deviceId: this.session.deviceId,
      accessToken: body.accessToken,
      expiresAt: body.expiresAt,
    };
    return this.session;
  }

  async revokeSession(): Promise<void> {
    await this.signedPost('/extension/session/revoke', {});
  }

  async listActiveTrades(limit = 10): Promise<TradeVerificationResult[]> {
    const body = await this.signedPost<{ trades: TradeVerificationResult[] }>(
      '/extension/trades/active',
      { limit },
    );
    return body.trades ?? [];
  }

  async verifyTrade(
    orderId: string,
    offerId?: string | null,
    observed?: {
      assetId?: string | null;
      floatValue?: string | null;
    },
  ): Promise<TradeVerificationResult> {
    return this.signedPost<TradeVerificationResult>('/extension/trades/verify', {
      orderId,
      ...(offerId ? { offerId } : {}),
      ...(observed?.assetId ? { observedAssetId: observed.assetId } : {}),
      ...(observed?.floatValue ? { observedFloatValue: observed.floatValue } : {}),
    });
  }

  async acknowledgeTrade(params: {
    orderId: string;
    type: TradeAcknowledgmentType;
    offerId?: string | null;
    idempotencyKey: string;
  }): Promise<{ ok: true; type: TradeAcknowledgmentType; idempotent: boolean }> {
    return this.signedPost('/extension/trades/acknowledge', {
      orderId: params.orderId,
      type: params.type,
      idempotencyKey: params.idempotencyKey,
      ...(params.offerId ? { offerId: params.offerId } : {}),
    });
  }

  private async signedPost<T>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const envelope = await this.buildSignedEnvelope(payload);
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) {
      const text = await response.text();
      throw parseExtensionApiError(path, response.status, text);
    }
    return (await response.json()) as T;
  }

  private async buildSignedEnvelope(
    payload: Record<string, unknown>,
  ): Promise<SignedEnvelope> {
    const normalizedPayload = jsonSafePayload(payload);
    const nonce = crypto.randomUUID();
    const timestampMs = Date.now();
    const ttlMs = 10_000;
    const message = await signatureMessage({
      sessionId: this.session.sessionId,
      deviceId: this.session.deviceId,
      nonce,
      timestampMs,
      ttlMs,
      payload: normalizedPayload,
    });
    const signature = await this.signMessage(message);
    return {
      deviceId: this.session.deviceId,
      nonce,
      timestampMs,
      ttlMs,
      payload: normalizedPayload,
      signature,
    };
  }
}
