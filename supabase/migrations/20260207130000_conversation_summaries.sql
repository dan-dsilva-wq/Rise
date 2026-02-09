-- Conversation summary cache for token optimization
-- Stores rolling summaries keyed by user + conversation identity.

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_message_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, conversation_key)
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_user_key
  ON conversation_summaries(user_id, conversation_key);

ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversation summaries" ON conversation_summaries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversation summaries" ON conversation_summaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversation summaries" ON conversation_summaries
  FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS conversation_summaries_updated_at ON conversation_summaries;
CREATE TRIGGER conversation_summaries_updated_at
  BEFORE UPDATE ON conversation_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
