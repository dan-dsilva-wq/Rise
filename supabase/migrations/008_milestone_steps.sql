-- Milestone Steps: AI-generated action items that persist
-- These are the "first steps" generated when opening a milestone

CREATE TABLE milestone_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  step_type TEXT NOT NULL DEFAULT 'action' CHECK (step_type IN ('action', 'decision', 'research')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE milestone_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can manage own milestone steps" ON milestone_steps
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_milestone_steps_milestone ON milestone_steps(milestone_id);
CREATE INDEX idx_milestone_steps_user ON milestone_steps(user_id);
CREATE INDEX idx_milestone_steps_order ON milestone_steps(milestone_id, sort_order);

-- Add approach column to milestone_conversations to remember do-it vs guide choice
ALTER TABLE milestone_conversations
ADD COLUMN IF NOT EXISTS approach TEXT CHECK (approach IN ('do-it', 'guide'));
