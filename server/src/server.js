import app from './app.js';
import config from './config/env.js';
import { connectDatabase } from './config/database.js';
import { startCheckoutRecovery } from './modules/shopping-orders/recovery.js';

await connectDatabase(config.mongoUri);

startCheckoutRecovery();

app.listen(config.port, () => {
  console.log(`Online Bookstore API listening on http://localhost:${config.port}`);
});
