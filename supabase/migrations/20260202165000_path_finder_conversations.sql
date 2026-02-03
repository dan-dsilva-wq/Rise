-- Path Finder Conversation History
-- Stores chat messages so conversations persist across sessions

CREATE TABLE IF NOT EXISTS path_finder_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT, -- Auto-generated or user-defined title
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS path_finder_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES path_finder_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pf_conversations_user_id ON path_finder_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_pf_messages_conversation_id ON path_finder_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pf_messages_user_id ON path_finder_messages(user_id);

-- RLS policies for conversations
ALTER TABLE path_finder_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON path_finder_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON path_finder_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON path_finder_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON path_finder_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for messages
ALTER TABLE path_finder_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own messages"
  ON path_finder_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON path_finder_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON path_finder_messages FOR DELETE
  USING (auth.uid() = user_id);
