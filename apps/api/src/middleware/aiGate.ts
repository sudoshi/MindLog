// =============================================================================
// MindLog API — AI Gate Middleware
//
// Fastify preHandler that blocks AI endpoints unless:
//   1. AI_INSIGHTS_ENABLED=true  in environment
//   2. ANTHROPIC_BAA_SIGNED=true in environment
//
// ⚠  HIPAA COMPLIANCE NOTE
//    Per 45 CFR §164.314, a Business Associate Agreement must be executed
//    with any sub-processor that handles PHI.  All LLM inference prompts
//    contain de-identified clinical data; however, the BAA flag ensures
//    that operators explicitly acknowledge this responsibility before enabling
//    the feature.
//
// Usage:
//   import { aiGate } from '../middleware/aiGate.js';
//   fastify.get('/insights/me/ai', { preHandler: [fastify.authenticate, aiGate] }, handler);
// =============================================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Blocks the request with 503 if AI insights are disabled or the BAA has not
 * been acknowledged via environment variable.
 */
export async function aiGate(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!config.aiInsightsEnabled) {
    return reply.status(503).send({
      success: false,
      error: {
        code:    'AI_DISABLED',
        message: 'AI-powered insights are not enabled on this instance. Set AI_INSIGHTS_ENABLED=true to activate.',
      },
    });
  }

  if (!config.anthropicBaaSigned) {
    return reply.status(503).send({
      success: false,
      error: {
        code:    'BAA_REQUIRED',
        message: 'A signed Business Associate Agreement with Anthropic is required before AI features may be activated. Set ANTHROPIC_BAA_SIGNED=true once the BAA is in place.',
      },
    });
  }
}
