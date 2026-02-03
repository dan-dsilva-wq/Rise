-- Add 'idea' status to milestones and notes field
-- This allows separating brainstorming (ideas) from committed work (milestones)

-- 1. Add notes column to milestones
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Update the status constraint to include 'idea'
ALTER TABLE milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE milestones ADD CONSTRAINT milestones_status_check
  CHECK (status IN ('pending', 'in_progress', 'completed', 'discarded', 'idea'));

-- 3. Update the progress calculation to exclude ideas (only count active milestones)
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_milestones INTEGER;
  completed_milestones INTEGER;
  new_progress INTEGER;
BEGIN
  -- Count only active milestones (not ideas or discarded)
  SELECT
    COUNT(*) FILTER (WHERE status NOT IN ('idea', 'discarded')),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_milestones, completed_milestones
  FROM milestones
  WHERE project_id = COALESCE(NEW.project_id, OLD.project_id);

  -- Calculate progress
  IF total_milestones > 0 THEN
    new_progress := (completed_milestones * 100) / total_milestones;
  ELSE
    new_progress := 0;
  END IF;

  -- Update project
  UPDATE projects
  SET progress_percent = new_progress
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
