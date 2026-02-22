// =============================================================================
// MindLog API — Safety resource routes (public — no auth required)
// GET /api/v1/safety/resources — static crisis resource list
// =============================================================================

import type { FastifyInstance } from 'fastify';

// Static list — extend via DB table in a future phase if clinician-configurable
// resources are needed.  These US resources are always safe to expose.
const SAFETY_RESOURCES = [
  {
    id: 'lifeline',
    name: '988 Suicide & Crisis Lifeline',
    phone: '988',
    text_to: '988',
    text_keyword: null,
    url: 'https://988lifeline.org',
    description: 'Free, confidential support 24/7 for people in distress.',
    available_24_7: true,
    type: 'crisis_line',
  },
  {
    id: 'crisis_text_line',
    name: 'Crisis Text Line',
    phone: null,
    text_to: '741741',
    text_keyword: 'HELLO',
    url: 'https://www.crisistextline.org',
    description: 'Text HOME to 741741 from anywhere in the USA.',
    available_24_7: true,
    type: 'text_line',
  },
  {
    id: 'veterans_crisis',
    name: 'Veterans Crisis Line',
    phone: '988',
    text_to: '838255',
    text_keyword: null,
    url: 'https://www.veteranscrisisline.net',
    description: 'Press 1 after dialing 988. Text 838255. Chat online.',
    available_24_7: true,
    type: 'crisis_line',
  },
  {
    id: 'samhsa',
    name: 'SAMHSA National Helpline',
    phone: '1-800-662-4357',
    text_to: null,
    text_keyword: null,
    url: 'https://www.samhsa.gov/find-help/national-helpline',
    description: 'Free, confidential treatment referral and information service.',
    available_24_7: true,
    type: 'treatment_referral',
  },
  {
    id: 'nami',
    name: 'NAMI Helpline',
    phone: '1-800-950-6264',
    text_to: '62640',
    text_keyword: 'NAMI',
    url: 'https://www.nami.org/help',
    description: 'Mental health information and support — Mon–Fri 10am–10pm ET.',
    available_24_7: false,
    type: 'support_line',
  },
];

export default async function safetyRoutes(fastify: FastifyInstance): Promise<void> {
  // Public endpoint — no authentication needed so patients can access even
  // if their session has expired.
  fastify.get('/resources', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        resources: SAFETY_RESOURCES,
        disclaimer: 'If you are in immediate danger, call 911 or go to your nearest emergency room.',
      },
    });
  });
}
