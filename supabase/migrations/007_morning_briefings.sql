-- Morning Briefings - AI-generated daily mission summary
CREATE TABLE IF NOT EXISTS morning_briefings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  briefing_date DATE NOT NULL,
  mission_summary TEXT NOT NULL,
  nudge TEXT NOT NULL,
  focus_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  focus_milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One briefing per user per day
  UNIQUE(user_id, briefing_date)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_morning_briefings_user_date ON morning_briefings(user_id, briefing_date);

-- RLS policies
ALTER TABLE morning_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own briefings"
  ON morning_briefings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own briefings"
  ON morning_briefings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own briefings"
  ON morning_briefings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own briefings"
  ON morning_briefings FOR DELETE
  USING (auth.uid() = user_id);
