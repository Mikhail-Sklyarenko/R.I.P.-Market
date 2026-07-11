/** Default e2e suite to mock providers; individual specs may override before createE2eApp(). */
process.env.INVENTORY_PROVIDER = 'mock';
process.env.TRADE_PROVIDER = 'mock';
process.env.ENABLE_EXTENSION_CHANNEL = 'true';
process.env.ENABLE_SETTLEMENT_HOLD_WINDOW = 'false';
process.env.ENABLE_EXTENSION_FIRST_TRADE_FLOW = 'false';
