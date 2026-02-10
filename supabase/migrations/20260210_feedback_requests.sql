-- Feedback requests table for beta user feedback
CREATE TABLE IF NOT EXISTS rise_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_rise_feedback_created_at ON rise_feedback (created_at DESC);
CREATE INDEX idx_rise_feedback_is_read ON rise_feedback (is_read);

-- RLS
ALTER TABLE rise_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON rise_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback"
  ON rise_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own feedback (for marking as read)
CREATE POLICY "Users can update own feedback"
  ON rise_feedback FOR UPDATE
  USING (auth.uid() = user_id);
