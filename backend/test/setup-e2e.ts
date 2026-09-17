/** Default e2e suite to mock providers; individual specs may override before createE2eApp(). */
process.env.INVENTORY_PROVIDER = 'mock';
process.env.TRADE_PROVIDER = 'mock';
process.env.ENABLE_EXTENSION_CHANNEL = 'true';
process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'false';
process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW = 'false';
// Money-path fail-closed defaults: e2e must opt into mock surfaces explicitly.
process.env.ENABLE_MOCK_TRADE = process.env.ENABLE_MOCK_TRADE ?? 'true';
process.env.ENABLE_MOCK_DEPOSIT = process.env.ENABLE_MOCK_DEPOSIT ?? 'true';
process.env.ALLOW_MOCK_ADMIN_LOGIN = process.env.ALLOW_MOCK_ADMIN_LOGIN ?? 'true';
// Rate limits default on in app code — keep e2e deterministic under burst traffic.
process.env.ENABLE_SENSITIVE_RATE_LIMITS =
  process.env.ENABLE_SENSITIVE_RATE_LIMITS ?? 'false';
process.env.ENABLE_EXTENSION_RATE_LIMITS =
  process.env.ENABLE_EXTENSION_RATE_LIMITS ?? 'false';

/**
 * Background warmers schedule work seconds after module init and then hit the
 * database. In e2e that lands after the suite closed its app, which surfaces as
 * "environment torn down" errors against unrelated specs.
 */
process.env.STEAM_MARKET_PRICE_ENABLED = 'false';
process.env.STEAM_ITEM_ICON_ENABLED = 'false';
