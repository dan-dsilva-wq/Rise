-- Add focus levels to milestones for better prioritization
-- Only ONE 'active' per project, max 3 'next', rest is 'backlog'

-- Add focus_level column
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS focus_level TEXT DEFAULT 'backlog';

-- Add constraint for valid values
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_focus_level_check;
ALTER TABLE milestones ADD CONSTRAINT milestones_focus_level_check
  CHECK (focus_level IN ('active', 'next', 'backlog'));

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_milestones_focus ON milestones(project_id, focus_level);
