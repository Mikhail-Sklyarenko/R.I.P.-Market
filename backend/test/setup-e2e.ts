/** Default e2e suite to mock providers; individual specs may override before createE2eApp(). */
process.env.INVENTORY_PROVIDER = 'mock';
process.env.TRADE_PROVIDER = 'mock';
