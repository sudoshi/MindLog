// =============================================================================
// MindLog API — Entry point
// =============================================================================

import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDb } from '@mindlog/db';

const app = await buildApp();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`Received ${signal}. Shutting down gracefully…`);
  await app.close();
  await closeDb();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
