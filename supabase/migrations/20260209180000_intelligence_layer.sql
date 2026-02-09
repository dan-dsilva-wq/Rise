-- Intelligence layer knowledge model
-- Adds deep user understanding, behavioral patterns, and proactive question tracking.

-- 1) Core understanding of who the user is
CREATE TABLE IF NOT EXISTS user_understanding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  background JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_situation JSONB NOT NULL DEFAULT '{}'::jsonb,
  values TEXT[] NOT NULL DEFAULT '{}',
  motivations TEXT[] NOT NULL DEFAULT '{}',
  definition_of_success TEXT,
  strengths TEXT[] NOT NULL DEFAULT '{}',
  blockers TEXT[] NOT NULL DEFAULT '{}',
  work_style JSONB NOT NULL DEFAULT '{}'::jsonb,
  unknown_questions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_understanding_user_id ON user_understanding(user_id);

ALTER TABLE user_understanding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own understanding" ON user_understanding;
CREATE POLICY "Users can view own understanding"
  ON user_understanding FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own understanding" ON user_understanding;
CREATE POLICY "Users can insert own understanding"
  ON user_understanding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own understanding" ON user_understanding;
CREATE POLICY "Users can update own understanding"
  ON user_understanding FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own understanding" ON user_understanding;
CREATE POLICY "Users can delete own understanding"
  ON user_understanding FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_understanding_updated_at ON user_understanding;
CREATE TRIGGER user_understanding_updated_at
  BEFORE UPDATE ON user_understanding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) Behavioral patterns detected
CREATE TABLE IF NOT EXISTS patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  first_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patterns_user_id ON patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_last_confirmed ON patterns(user_id, last_confirmed DESC);

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own patterns" ON patterns;
CREATE POLICY "Users can view own patterns"
  ON patterns FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own patterns" ON patterns;
CREATE POLICY "Users can insert own patterns"
  ON patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own patterns" ON patterns;
CREATE POLICY "Users can update own patterns"
  ON patterns FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own patterns" ON patterns;
CREATE POLICY "Users can delete own patterns"
  ON patterns FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS patterns_updated_at ON patterns;
CREATE TRIGGER patterns_updated_at
  BEFORE UPDATE ON patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3) Proactive questions and outcomes
CREATE TABLE IF NOT EXISTS proactive_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gap_identified TEXT NOT NULL,
  question TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  answer TEXT,
  insight_generated UUID REFERENCES ai_insights(id) ON DELETE SET NULL,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proactive_questions_user_id ON proactive_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_questions_sent_at ON proactive_questions(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_proactive_questions_answered_at ON proactive_questions(user_id, answered_at DESC);

ALTER TABLE proactive_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own proactive questions" ON proactive_questions;
CREATE POLICY "Users can view own proactive questions"
  ON proactive_questions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own proactive questions" ON proactive_questions;
CREATE POLICY "Users can insert own proactive questions"
  ON proactive_questions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own proactive questions" ON proactive_questions;
CREATE POLICY "Users can update own proactive questions"
  ON proactive_questions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own proactive questions" ON proactive_questions;
CREATE POLICY "Users can delete own proactive questions"
  ON proactive_questions FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS proactive_questions_updated_at ON proactive_questions;
CREATE TRIGGER proactive_questions_updated_at
  BEFORE UPDATE ON proactive_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4) Gap attribution for existing insights table
ALTER TABLE ai_insights
  ADD COLUMN IF NOT EXISTS fills_gap TEXT;
