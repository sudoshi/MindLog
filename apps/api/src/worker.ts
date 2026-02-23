// =============================================================================
// MindLog API — Worker entrypoint
// Run separately from the HTTP server:
//   tsx src/worker.ts
//
// Starts:
//   1. Rules engine worker (BullMQ)
//   2. Nightly batch scheduler (BullMQ QueueScheduler pattern via repeat)
// =============================================================================

import { startRulesWorker, rulesQueue } from './workers/rules-engine.js';
import { startNightlyScheduler } from './workers/nightly-scheduler.js';
import { startReportWorker, reportQueue } from './workers/report-generator.js';
import { startAiInsightsWorker, aiInsightsQueue } from './workers/ai-insights-worker.js';
import { startResearchExportWorker, researchQueue } from './routes/research/index.js';
import { closeDb } from '@mindlog/db';
import { config } from './config.js';

console.info('[worker] Starting MindLog worker process…');
console.info(`[worker] Redis: ${config.redisUrl}`);
console.info(`[worker] AI insights: ${config.aiInsightsEnabled ? 'ENABLED' : 'disabled'}`);

// Start workers
const rulesWorker          = startRulesWorker();
const scheduler            = startNightlyScheduler();
const reportWorker         = startReportWorker();
const aiWorker             = startAiInsightsWorker();
const researchExportWorker = startResearchExportWorker();

// Graceful shutdown
const shutdown = async (signal: string): Promise<void> => {
  console.info(`[worker] ${signal} received — shutting down`);
  await Promise.all([
    rulesWorker.close(),
    scheduler.close(),
    reportWorker.close(),
    aiWorker.close(),
    researchExportWorker.close(),
    rulesQueue.close(),
    reportQueue.close(),
    aiInsightsQueue.close(),
    researchQueue.close(),
  ]);
  await closeDb();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[worker] Uncaught exception:', err);
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[worker] Unhandled rejection:', reason);
  void shutdown('unhandledRejection');
});

console.info('[worker] Ready');
