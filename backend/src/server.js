import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { seedAdmin } from './scripts/seedAdmin.js';

try {
  await connectDatabase();
  await seedAdmin();
  app.listen(env.port, () => console.log(`API listening on port ${env.port}`));
} catch (error) {
  console.error('Unable to start API:', error.message);
  process.exit(1);
}
