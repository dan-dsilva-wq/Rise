-- Feedback requests table for beta user feedback
CREATE TABLE IF NOT EXISTS feedback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_requests_created_at ON feedback_requests (created_at DESC);
CREATE INDEX idx_feedback_requests_is_read ON feedback_requests (is_read);

-- RLS
ALTER TABLE feedback_requests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON feedback_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback
CREATE POLICY "Users can read own feedback"
  ON feedback_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own feedback (for marking as read)
CREATE POLICY "Users can update own feedback"
  ON feedback_requests FOR UPDATE
  USING (auth.uid() = user_id);
