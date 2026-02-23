// =============================================================================
// MindLog API — Global error handler plugin
// =============================================================================

import type { FastifyInstance, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { captureException } from '../sentry.js';

async function errorHandlerPlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((error: FastifyError | ZodError | Error, request, reply) => {
    const log = fastify.log;

    // Zod validation errors → 422
    if (error instanceof ZodError) {
      return reply.status(422).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.flatten(),
        },
      });
    }

    // Fastify validation errors → 400
    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: error.message,
          details: error.validation,
        },
      });
    }

    // Known HTTP errors (statusCode set by Fastify)
    const statusCode = 'statusCode' in error && error.statusCode ? error.statusCode : 500;
    if (statusCode < 500) {
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: 'CLIENT_ERROR',
          message: error.message,
        },
      });
    }

    // Unexpected server errors — log + send to Sentry, return generic message
    log.error({ err: error, req: { method: request.method, url: request.url } }, 'Unhandled error');
    captureException(error, { method: request.method, url: request.url });

    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
