import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { seedAdmin } from './scripts/seedAdmin.js';

try {
  await connectDatabase();
  await seedAdmin();
  const server = app.listen(env.port, () => console.log(`API listening on port ${env.port}`));
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Unable to start API: port ${env.port} is already in use. Stop the existing backend process before running npm run dev again.`);
    } else {
      console.error('Unable to start API server:', error.message);
    }
    process.exit(1);
  });
} catch (error) {
  console.error('Unable to start API:', error.message);
  process.exit(1);
}
