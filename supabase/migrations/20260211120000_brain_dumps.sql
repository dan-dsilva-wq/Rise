-- Brain Dumps: voice conversation transcripts with extracted metadata
CREATE TABLE IF NOT EXISTS brain_dumps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  mood TEXT,
  energy_level INTEGER CHECK (energy_level >= 1 AND energy_level <= 10),
  topics TEXT[] NOT NULL DEFAULT '{}',
  people_mentioned JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brain_dumps_user_id ON brain_dumps(user_id);
CREATE INDEX idx_brain_dumps_created_at ON brain_dumps(user_id, created_at DESC);

ALTER TABLE brain_dumps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own brain dumps"
  ON brain_dumps FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brain dumps"
  ON brain_dumps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brain dumps"
  ON brain_dumps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brain dumps"
  ON brain_dumps FOR DELETE
  USING (auth.uid() = user_id);
