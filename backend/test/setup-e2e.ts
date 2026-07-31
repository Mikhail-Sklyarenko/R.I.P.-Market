/** Default e2e suite to mock providers; individual specs may override before createE2eApp(). */
process.env.INVENTORY_PROVIDER = 'mock';
process.env.TRADE_PROVIDER = 'mock';
process.env.ENABLE_EXTENSION_CHANNEL = 'true';
process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'false';
process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW = 'false';

/**
 * Background warmers schedule work seconds after module init and then hit the
 * database. In e2e that lands after the suite closed its app, which surfaces as
 * "environment torn down" errors against unrelated specs.
 */
process.env.STEAM_MARKET_PRICE_ENABLED = 'false';
process.env.STEAM_ITEM_ICON_ENABLED = 'false';
