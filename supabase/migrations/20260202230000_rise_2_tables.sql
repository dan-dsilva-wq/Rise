-- Rise 2.0 Database Schema
-- ================================
-- Path Finder, Projects, Missions, AI Builder

-- ================================
-- PATH_FINDER_PROGRESS TABLE
-- Tracks user's journey through decision tree
-- ================================
CREATE TABLE path_finder_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Current position in tree
  current_node_id TEXT NOT NULL DEFAULT 'start',

  -- History of visited nodes
  visited_nodes TEXT[] DEFAULT '{}',

  -- Selected path (final destination node)
  selected_path TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- PROJECTS TABLE
-- User's projects they're building
-- ================================
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Project info
  name TEXT NOT NULL,
  description TEXT,

  -- Status: discovery, planning, building, launched, paused
  status TEXT DEFAULT 'discovery' CHECK (status IN ('discovery', 'planning', 'building', 'launched', 'paused')),

  -- From Path Finder
  path_node_id TEXT, -- Which suggestion node created this

  -- Income tracking
  target_income INTEGER DEFAULT 0, -- Monthly target in cents
  actual_income INTEGER DEFAULT 0, -- Monthly actual in cents

  -- Progress
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- MILESTONES TABLE
-- Project milestones/phases
-- ================================
CREATE TABLE milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Milestone info
  title TEXT NOT NULL,
  description TEXT,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Status: pending, in_progress, completed
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),

  -- Optional due date
  due_date DATE,

  -- XP reward for completing milestone
  xp_reward INTEGER DEFAULT 100,

  -- Timestamps
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- DAILY_MISSIONS TABLE
-- Daily tasks generated from milestones
-- ================================
CREATE TABLE daily_missions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Linked project/milestone (optional - can have standalone missions)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,

  -- Mission info
  title TEXT NOT NULL,
  description TEXT,

  -- Date for this mission
  mission_date DATE NOT NULL,

  -- Status: pending, in_progress, completed, skipped
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),

  -- XP reward
  xp_reward INTEGER DEFAULT 50,

  -- Priority (1 = highest)
  priority INTEGER DEFAULT 1,

  -- Timestamps
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index for quick lookup
  UNIQUE(user_id, mission_date, title)
);

-- ================================
-- PROJECT_LOGS TABLE
-- AI conversation history for projects
-- ================================
CREATE TABLE project_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- Message
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Optional metadata (for code blocks, artifacts, etc.)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- INDEXES
-- ================================
CREATE INDEX idx_path_finder_user ON path_finder_progress(user_id);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(user_id, status);
CREATE INDEX idx_milestones_project ON milestones(project_id, sort_order);
CREATE INDEX idx_milestones_user ON milestones(user_id);
CREATE INDEX idx_daily_missions_user_date ON daily_missions(user_id, mission_date DESC);
CREATE INDEX idx_daily_missions_status ON daily_missions(user_id, status, mission_date);
CREATE INDEX idx_project_logs_project ON project_logs(project_id, created_at DESC);

-- ================================
-- ROW LEVEL SECURITY
-- ================================
ALTER TABLE path_finder_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_logs ENABLE ROW LEVEL SECURITY;

-- Path Finder Progress: Users can only access their own
CREATE POLICY "Users can view own path_finder_progress" ON path_finder_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own path_finder_progress" ON path_finder_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own path_finder_progress" ON path_finder_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Projects: Users can only access their own
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- Milestones: Users can only access their own
CREATE POLICY "Users can view own milestones" ON milestones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own milestones" ON milestones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own milestones" ON milestones
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own milestones" ON milestones
  FOR DELETE USING (auth.uid() = user_id);

-- Daily Missions: Users can only access their own
CREATE POLICY "Users can view own daily_missions" ON daily_missions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily_missions" ON daily_missions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily_missions" ON daily_missions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own daily_missions" ON daily_missions
  FOR DELETE USING (auth.uid() = user_id);

-- Project Logs: Users can only access their own
CREATE POLICY "Users can view own project_logs" ON project_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project_logs" ON project_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ================================
-- TRIGGERS
-- ================================
CREATE TRIGGER path_finder_progress_updated_at
  BEFORE UPDATE ON path_finder_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER daily_missions_updated_at
  BEFORE UPDATE ON daily_missions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================
-- FUNCTIONS
-- ================================

-- Function to update project progress based on milestones
CREATE OR REPLACE FUNCTION update_project_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_milestones INTEGER;
  completed_milestones INTEGER;
  new_progress INTEGER;
BEGIN
  -- Count milestones for this project
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
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

-- Trigger to auto-update project progress
CREATE TRIGGER milestone_progress_update
  AFTER INSERT OR UPDATE OR DELETE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_project_progress();

-- Function to complete a mission and award XP
CREATE OR REPLACE FUNCTION complete_mission(mission_id UUID)
RETURNS INTEGER AS $$
DECLARE
  mission_record RECORD;
  xp_earned INTEGER;
BEGIN
  -- Get mission details
  SELECT * INTO mission_record
  FROM daily_missions
  WHERE id = mission_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF mission_record.status = 'completed' THEN
    RETURN 0; -- Already completed
  END IF;

  xp_earned := mission_record.xp_reward;

  -- Mark as completed
  UPDATE daily_missions
  SET status = 'completed', completed_at = NOW()
  WHERE id = mission_id;

  -- Award XP
  PERFORM increment_xp(mission_record.user_id, xp_earned);

  RETURN xp_earned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
