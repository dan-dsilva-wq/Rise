-- AI Context Bank: Enables all AI features to share context
-- Migration: 009_ai_context_bank.sql

-- 1. project_context - Per-project structured decisions and context
CREATE TABLE project_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL, -- 'tech_stack', 'target_audience', 'constraints', 'decisions', 'requirements'
  key TEXT NOT NULL,          -- e.g., 'framework', 'budget', 'timeline'
  value TEXT NOT NULL,        -- e.g., 'React Native', '$0', '3 months'
  confidence FLOAT DEFAULT 1.0, -- How certain (1.0 = user confirmed, 0.5 = AI inferred)
  source TEXT,                -- 'path_finder', 'milestone_mode', 'user_input'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, context_type, key)
);

-- Indexes for efficient querying
CREATE INDEX idx_project_context_project_id ON project_context(project_id);
CREATE INDEX idx_project_context_user_id ON project_context(user_id);
CREATE INDEX idx_project_context_type ON project_context(context_type);

-- RLS Policies for project_context
ALTER TABLE project_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own project context"
  ON project_context FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own project context"
  ON project_context FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own project context"
  ON project_context FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own project context"
  ON project_context FOR DELETE
  USING (auth.uid() = user_id);

-- 2. ai_insights - Cross-conversation learnings and discoveries
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- null = global insight
  milestone_id UUID REFERENCES milestones(id) ON DELETE CASCADE, -- null = project-level
  insight_type TEXT NOT NULL, -- 'discovery', 'decision', 'blocker', 'preference', 'learning'
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10), -- 1-10 scale
  source_conversation_id UUID, -- Which conversation it came from
  source_ai TEXT NOT NULL, -- 'path_finder', 'milestone_mode', 'project_chat'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- Some insights are temporary
  is_active BOOLEAN DEFAULT true
);

-- Indexes for efficient querying
CREATE INDEX idx_ai_insights_user_id ON ai_insights(user_id);
CREATE INDEX idx_ai_insights_project_id ON ai_insights(project_id);
CREATE INDEX idx_ai_insights_milestone_id ON ai_insights(milestone_id);
CREATE INDEX idx_ai_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_ai_insights_active ON ai_insights(is_active) WHERE is_active = true;

-- RLS Policies for ai_insights
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own insights"
  ON ai_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own insights"
  ON ai_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own insights"
  ON ai_insights FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own insights"
  ON ai_insights FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp for project_context
CREATE OR REPLACE FUNCTION update_project_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_project_context_updated_at
  BEFORE UPDATE ON project_context
  FOR EACH ROW
  EXECUTE FUNCTION update_project_context_updated_at();
