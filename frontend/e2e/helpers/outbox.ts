import { APIRequestContext } from '@playwright/test';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://127.0.0.1:3001/api/v1';

async function getAdminToken(request: APIRequestContext) {
  const adminLogin = await request.post(`${apiBase()}/auth/mock-login`, {
    data: { role: 'ADMIN' },
  });
  if (!adminLogin.ok()) {
    throw new Error(`Outbox admin login failed: ${adminLogin.status()}`);
  }
  return ((await adminLogin.json()) as { accessToken: string }).accessToken;
}

/** Flush pending outbox events (auto processor is off under ENABLE_TEST_ROUTES). */
export async function processPendingOutbox(request: APIRequestContext) {
  const adminToken = await getAdminToken(request);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(`${apiBase()}/admin/outbox/process`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!response.ok()) {
      throw new Error(`Outbox processing failed: ${response.status()}`);
    }
    const body = (await response.json()) as { processed?: number; failed?: number };
    if (body.failed) throw new Error(`Outbox events failed: ${body.failed}`);
    if ((body.processed ?? 0) === 0) {
      return;
    }
  }
}
