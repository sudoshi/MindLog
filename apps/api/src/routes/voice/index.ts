// =============================================================================
// MindLog API — Voice transcription route
// POST /api/v1/voice/transcribe
//
// Accepts a multipart audio file (m4a, mp3, wav; max 25 MB).
// Calls OpenAI Whisper to transcribe → returns { transcript, duration_seconds }.
// Rate-limited to 5 transcriptions per hour per patient (Redis counter).
// =============================================================================

import type { FastifyInstance } from 'fastify';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { sql } from '@mindlog/db';
import '@fastify/multipart'; // trigger module augmentation for request.file / request.isMultipart

// @fastify/redis is registered in app.ts; declare the decoration here so TS knows.
declare module 'fastify' {
  interface FastifyInstance {
    redis: import('ioredis').Redis;
  }
}

const RATE_LIMIT_MAX   = 5;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour in seconds
const MAX_FILE_BYTES    = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIME = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav',
  'audio/webm', 'audio/ogg', 'audio/mp3',
]);

// Lazy Whisper client — only initialised when OPENAI_API_KEY is present
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env['OPENAI_API_KEY'];
    if (!key) throw new Error('OPENAI_API_KEY is not configured on this server');
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

export default async function voiceRoutes(fastify: FastifyInstance): Promise<void> {
  const auth = { preHandler: [fastify.authenticate] };

  // ── POST /voice/transcribe ─────────────────────────────────────────────────
  fastify.post('/transcribe', auth, async (request, reply) => {
    if (request.user.role !== 'patient') {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Patient access only' },
      });
    }

    const patientId = request.user.sub;

    // ------------------------------------------------------------------
    // Rate-limit check via Redis  (5 transcriptions per hour per patient)
    // ------------------------------------------------------------------
    const rateKey = `voice:rate:${patientId}`;
    const redis = fastify.redis as import('ioredis').Redis;
    const current = await redis.incr(rateKey);
    if (current === 1) {
      // First call in this window — set TTL
      await redis.expire(rateKey, RATE_LIMIT_WINDOW);
    }
    if (current > RATE_LIMIT_MAX) {
      return reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Voice transcription is limited to ${RATE_LIMIT_MAX} per hour`,
        },
      });
    }

    // ------------------------------------------------------------------
    // Parse multipart upload
    // ------------------------------------------------------------------
    if (!request.isMultipart?.()) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Request must be multipart/form-data' },
      });
    }

    const data = await request.file({ limits: { fileSize: MAX_FILE_BYTES } });
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Audio file is required (field: audio)' },
      });
    }

    if (!ALLOWED_MIME.has(data.mimetype)) {
      // Drain the stream to avoid leaking
      await data.toBuffer().catch(() => null);
      return reply.status(400).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: 'Supported formats: m4a, mp3, wav, webm, ogg',
        },
      });
    }

    // ------------------------------------------------------------------
    // Write to a temp file (Whisper requires a real file stream with extension)
    // ------------------------------------------------------------------
    const ext = data.mimetype.includes('wav') ? 'wav'
               : data.mimetype.includes('mp3') || data.mimetype.includes('mpeg') ? 'mp3'
               : 'm4a';
    const tmpPath = join(tmpdir(), `ml-voice-${randomUUID()}.${ext}`);

    try {
      await pipeline(data.file, createWriteStream(tmpPath));

      // ------------------------------------------------------------------
      // OpenAI Whisper transcription
      // ------------------------------------------------------------------
      let openai: OpenAI;
      try {
        openai = getOpenAI();
      } catch {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'FEATURE_UNAVAILABLE',
            message: 'Voice transcription is not configured on this server',
          },
        });
      }

      const transcription = await openai.audio.transcriptions.create({
        file:  createReadStream(tmpPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
      });

      // ------------------------------------------------------------------
      // Audit log — no transcript content stored (PHI consideration)
      // ------------------------------------------------------------------
      await sql`
        INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id)
        VALUES (
          ${patientId}, 'patient', 'voice_transcription',
          'daily_entry', NULL
        )
      `;

      const duration = 'duration' in transcription
        ? (transcription as { duration?: number }).duration ?? 0
        : 0;

      return reply.send({
        success: true,
        data: {
          transcript: transcription.text,
          duration_seconds: Math.round(duration),
        },
      });
    } finally {
      // Always clean up temp file
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    }
  });
}
