-- User Profile Facts for Path Finder
-- Stores persistent information about the user that Path Finder can reference

CREATE TABLE IF NOT EXISTS user_profile_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'background', 'skills', 'situation', 'goals', 'preferences', 'constraints'
  fact TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profile_facts_user_id ON user_profile_facts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_facts_category ON user_profile_facts(user_id, category);

-- RLS policies
ALTER TABLE user_profile_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile facts"
  ON user_profile_facts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile facts"
  ON user_profile_facts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile facts"
  ON user_profile_facts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile facts"
  ON user_profile_facts FOR DELETE
  USING (auth.uid() = user_id);
