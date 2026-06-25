import { APIRequestContext } from '@playwright/test';

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export async function resetDatabase(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${API_BASE}/test/reset`);
  if (!response.ok()) {
    throw new Error(`Failed to reset database: ${response.status()}`);
  }
  const body = (await response.json()) as { ok: boolean };
  if (!body.ok) {
    throw new Error('Database reset endpoint returned ok=false');
  }
}
