// =============================================================================
// MindLog API — Route registry
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { API_PREFIX } from '@mindlog/shared';
import healthRoutes from './health.js';
import authRoutes from './auth.js';
import patientRoutes from './patients/index.js';
import dailyEntryRoutes from './daily-entries/index.js';
import journalRoutes from './journal/index.js';
import alertRoutes from './alerts/index.js';
import clinicianRoutes from './clinicians/index.js';
import reportRoutes from './reports/index.js';
import syncRoutes from './sync/index.js';
import notificationRoutes from './notifications/index.js';
import consentRoutes from './consent/index.js';
import catalogueRoutes from './catalogues/index.js';
import medicationRoutes from './medications/index.js';
import insightsRoutes from './insights/index.js';
import safetyRoutes from './safety/index.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check — no prefix, no auth
  await fastify.register(healthRoutes);

  // Versioned API routes
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(patientRoutes, { prefix: '/patients' });
      await api.register(dailyEntryRoutes, { prefix: '/daily-entries' });
      await api.register(journalRoutes, { prefix: '/journal' });
      await api.register(alertRoutes, { prefix: '/alerts' });
      await api.register(clinicianRoutes, { prefix: '/clinicians' });
      await api.register(reportRoutes, { prefix: '/reports' });
      await api.register(syncRoutes, { prefix: '/sync' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(consentRoutes, { prefix: '/consent' });
      await api.register(catalogueRoutes, { prefix: '/catalogues' });
      await api.register(medicationRoutes, { prefix: '/medications' });
      await api.register(insightsRoutes, { prefix: '/insights' });
      await api.register(safetyRoutes, { prefix: '/safety' });
    },
    { prefix: API_PREFIX },
  );
}
