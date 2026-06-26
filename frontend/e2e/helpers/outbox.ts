import { APIRequestContext } from '@playwright/test';

const apiBase = () => process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function getAdminToken(request: APIRequestContext) {
  const adminLogin = await request.post(`${apiBase()}/auth/mock-login`, {
    data: { role: 'ADMIN' },
  });
  return ((await adminLogin.json()) as { accessToken: string }).accessToken;
}

/** Flush pending outbox events (auto processor is off under ENABLE_TEST_ROUTES). */
export async function processPendingOutbox(request: APIRequestContext) {
  const adminToken = await getAdminToken(request);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request.post(`${apiBase()}/admin/outbox/process`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = (await response.json()) as { processed?: number };
    if ((body.processed ?? 0) === 0) {
      return;
    }
  }
}
