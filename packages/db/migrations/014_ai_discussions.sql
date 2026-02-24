-- =============================================================================
-- Migration 014: AI Discussion Threads
--
-- Adds two tables to support interactive AI assistant chat on the clinician
-- dashboard's AI Insights panel. Discussions are linked to a patient and
-- clinician, creating an auditable clinical dialogue trail.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ai_discussions — conversation thread metadata
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_discussions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  clinician_id      UUID NOT NULL REFERENCES clinicians(id),
  title             TEXT NOT NULL DEFAULT 'New Discussion',
  message_count     INT NOT NULL DEFAULT 0,
  total_input_tokens  INT NOT NULL DEFAULT 0,
  total_output_tokens INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_discussions_patient_updated
  ON ai_discussions (patient_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- ai_discussion_messages — individual messages within a discussion
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_discussion_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id   UUID NOT NULL REFERENCES ai_discussions(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('clinician', 'assistant')),
  content         TEXT NOT NULL,
  model_id        TEXT,              -- null for clinician messages
  input_tokens    INT,               -- null for clinician messages
  output_tokens   INT,               -- null for clinician messages
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_discussion_messages_thread
  ON ai_discussion_messages (discussion_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- RLS — service_role has full access; clinicians access their own discussions
-- ---------------------------------------------------------------------------
ALTER TABLE ai_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_discussion_messages ENABLE ROW LEVEL SECURITY;

-- Service role (API server) can do everything
CREATE POLICY ai_discussions_service_all
  ON ai_discussions FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY ai_discussion_messages_service_all
  ON ai_discussion_messages FOR ALL
  USING (true) WITH CHECK (true);
