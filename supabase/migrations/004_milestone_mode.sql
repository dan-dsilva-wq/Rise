-- Milestone Mode: AI-assisted milestone completion
-- Conversations are saved so users can return if interrupted

-- Milestone conversations table
CREATE TABLE milestone_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Milestone messages table
CREATE TABLE milestone_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES milestone_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE milestone_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own milestone conversations" ON milestone_conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own milestone messages" ON milestone_messages
  FOR ALL USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_milestone_conversations_milestone ON milestone_conversations(milestone_id);
CREATE INDEX idx_milestone_conversations_user ON milestone_conversations(user_id);
CREATE INDEX idx_milestone_messages_conversation ON milestone_messages(conversation_id);
CREATE INDEX idx_milestone_messages_created ON milestone_messages(created_at);
