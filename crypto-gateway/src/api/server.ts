import { createApiApp } from './routes.js';
import { loadApiConfig } from '../shared/config.js';

const config = loadApiConfig();
const app = createApiApp();

app.listen(config.port, () => {
  console.log(`crypto-gateway api listening on :${config.port}`);
});
