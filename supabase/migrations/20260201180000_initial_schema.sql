-- Rise App Database Schema
-- ================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================
-- PROFILES TABLE
-- Extends Supabase auth.users
-- ================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  timezone TEXT DEFAULT 'UTC',

  -- Gamification
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  unlock_tier INTEGER DEFAULT 1,

  -- Grace day tracking (1 per week)
  grace_days_used_this_week INTEGER DEFAULT 0,
  week_start_date DATE DEFAULT CURRENT_DATE,

  -- Partner sharing (future feature)
  partner_sharing_enabled BOOLEAN DEFAULT FALSE,
  partner_email TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- DAILY_LOGS TABLE
-- One entry per day per user
-- ================================
CREATE TABLE daily_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,

  -- Morning data
  wake_time TIMESTAMPTZ,
  im_up_pressed_at TIMESTAMPTZ,
  time_to_rise_minutes INTEGER, -- Time from alarm to actually getting up
  morning_energy INTEGER CHECK (morning_energy >= 1 AND morning_energy <= 10),
  morning_mood INTEGER CHECK (morning_mood >= 1 AND morning_mood <= 10),

  -- Morning checklist
  feet_on_floor BOOLEAN DEFAULT FALSE,
  light_exposure BOOLEAN DEFAULT FALSE,
  drank_water BOOLEAN DEFAULT FALSE,

  -- Evening data
  evening_energy INTEGER CHECK (evening_energy >= 1 AND evening_energy <= 10),
  evening_mood INTEGER CHECK (evening_mood >= 1 AND evening_mood <= 10),
  day_rating INTEGER CHECK (day_rating >= 1 AND day_rating <= 10),

  -- Movement (Tier 2+)
  movement_minutes INTEGER DEFAULT 0,
  went_outside BOOLEAN DEFAULT FALSE,

  -- Reflection (Tier 3+)
  gratitude_entry TEXT,
  reflection_notes TEXT,

  -- XP earned this day
  xp_earned INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One log per user per day
  UNIQUE(user_id, log_date)
);

-- ================================
-- HABITS TABLE
-- User-defined habits (Tier 4+)
-- ================================
CREATE TABLE habits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  name TEXT NOT NULL,
  emoji TEXT DEFAULT '✓',
  description TEXT,

  -- Frequency: 'daily', 'weekdays', 'weekends', 'custom'
  frequency TEXT DEFAULT 'daily',
  frequency_days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}', -- 1=Mon, 7=Sun

  -- Habit stacking
  anchor_habit_id UUID REFERENCES habits(id),
  anchor_position TEXT CHECK (anchor_position IN ('before', 'after')),

  -- Tracking
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  xp_value INTEGER DEFAULT 25,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- HABIT_COMPLETIONS TABLE
-- ================================
CREATE TABLE habit_completions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  completion_date DATE NOT NULL,
  xp_earned INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT NOW(),

  -- One completion per habit per day
  UNIQUE(habit_id, completion_date)
);

-- ================================
-- ACHIEVEMENTS TABLE
-- System-defined achievements
-- ================================
CREATE TABLE achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '🏆',

  -- Unlock condition stored as JSON
  -- e.g., {"type": "streak", "value": 7}
  -- e.g., {"type": "total_xp", "value": 1000}
  unlock_condition JSONB NOT NULL,

  -- XP bonus for unlocking
  xp_reward INTEGER DEFAULT 100,

  -- Display order
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- USER_ACHIEVEMENTS TABLE
-- ================================
CREATE TABLE user_achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),

  -- One achievement per user
  UNIQUE(user_id, achievement_id)
);

-- ================================
-- DAILY PROMPTS/QUOTES TABLE
-- ================================
CREATE TABLE daily_prompts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  prompt_text TEXT NOT NULL,
  author TEXT,
  category TEXT DEFAULT 'motivation', -- motivation, reflection, gratitude
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================
-- INDEXES
-- ================================
CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, log_date DESC);
CREATE INDEX idx_daily_logs_date ON daily_logs(log_date DESC);
CREATE INDEX idx_habit_completions_user_date ON habit_completions(user_id, completion_date DESC);
CREATE INDEX idx_habits_user ON habits(user_id);
CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);

-- ================================
-- ROW LEVEL SECURITY
-- ================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only access their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Daily logs: Users can only access their own logs
CREATE POLICY "Users can view own daily_logs" ON daily_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily_logs" ON daily_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily_logs" ON daily_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- Habits: Users can only access their own habits
CREATE POLICY "Users can view own habits" ON habits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habits" ON habits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own habits" ON habits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own habits" ON habits
  FOR DELETE USING (auth.uid() = user_id);

-- Habit completions: Users can only access their own
CREATE POLICY "Users can view own habit_completions" ON habit_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own habit_completions" ON habit_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User achievements: Users can view their own
CREATE POLICY "Users can view own achievements" ON user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements" ON user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Achievements and prompts are public read
CREATE POLICY "Anyone can view achievements" ON achievements
  FOR SELECT USING (true);

CREATE POLICY "Anyone can view prompts" ON daily_prompts
  FOR SELECT USING (is_active = true);

-- ================================
-- FUNCTIONS
-- ================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================
-- SEED DATA: Initial Achievements
-- ================================
INSERT INTO achievements (code, name, description, emoji, unlock_condition, xp_reward, display_order) VALUES
  ('first_morning', 'First Light', 'Complete your first morning check-in', '🌅', '{"type": "morning_count", "value": 1}', 50, 1),
  ('streak_3', 'Getting Started', 'Maintain a 3-day streak', '🔥', '{"type": "streak", "value": 3}', 100, 2),
  ('streak_7', 'One Week Wonder', 'Maintain a 7-day streak', '⭐', '{"type": "streak", "value": 7}', 250, 3),
  ('streak_14', 'Two Week Warrior', 'Maintain a 14-day streak', '💪', '{"type": "streak", "value": 14}', 500, 4),
  ('streak_30', 'Monthly Master', 'Maintain a 30-day streak', '🏆', '{"type": "streak", "value": 30}', 1000, 5),
  ('xp_500', 'Rising Up', 'Earn 500 total XP', '📈', '{"type": "total_xp", "value": 500}', 100, 6),
  ('xp_1500', 'On the Move', 'Earn 1,500 total XP', '🚀', '{"type": "total_xp", "value": 1500}', 200, 7),
  ('xp_4000', 'Building Momentum', 'Earn 4,000 total XP', '⚡', '{"type": "total_xp", "value": 4000}', 500, 8),
  ('xp_10000', 'Thriving', 'Earn 10,000 total XP', '👑', '{"type": "total_xp", "value": 10000}', 1000, 9),
  ('early_bird', 'Early Bird', 'Wake up before 7 AM', '🐦', '{"type": "wake_before", "value": "07:00"}', 75, 10),
  ('hydrated', 'Hydration Station', 'Drink water 7 days in a row', '💧', '{"type": "water_streak", "value": 7}', 150, 11),
  ('sunshine', 'Sunshine Seeker', 'Get morning light 7 days in a row', '☀️', '{"type": "light_streak", "value": 7}', 150, 12),
  ('comeback', 'Comeback Kid', 'Return after missing a day (grace day used)', '🔄', '{"type": "grace_day_used", "value": 1}', 50, 13),
  ('tier_2', 'Level Up: Move', 'Unlock Tier 2', '🏃', '{"type": "tier", "value": 2}', 200, 14),
  ('tier_3', 'Level Up: Reflect', 'Unlock Tier 3', '🧘', '{"type": "tier", "value": 3}', 300, 15),
  ('tier_4', 'Level Up: Build', 'Unlock Tier 4', '🔨', '{"type": "tier", "value": 4}', 500, 16),
  ('tier_5', 'Level Up: Thrive', 'Unlock Tier 5', '🌟', '{"type": "tier", "value": 5}', 1000, 17);

-- ================================
-- SEED DATA: Daily Prompts
-- ================================
INSERT INTO daily_prompts (prompt_text, author, category) VALUES
  ('The secret of getting ahead is getting started.', 'Mark Twain', 'motivation'),
  ('Action is the foundational key to all success.', 'Pablo Picasso', 'motivation'),
  ('You don''t have to be great to start, but you have to start to be great.', 'Zig Ziglar', 'motivation'),
  ('The only impossible journey is the one you never begin.', 'Tony Robbins', 'motivation'),
  ('Small steps every day lead to big changes.', NULL, 'motivation'),
  ('Your only job right now is to get up. Everything else can wait.', NULL, 'motivation'),
  ('Motivation follows action. Start, and the energy will come.', NULL, 'motivation'),
  ('Today is a new page. What will you write?', NULL, 'reflection'),
  ('You showed up. That''s already a win.', NULL, 'motivation'),
  ('Be patient with yourself. Nothing in nature blooms all year.', NULL, 'motivation'),
  ('You are not behind. You are exactly where you need to be.', NULL, 'motivation'),
  ('Rest if you must, but don''t quit.', NULL, 'motivation'),
  ('The bed will always be there. Your life is waiting outside of it.', NULL, 'motivation'),
  ('Every morning is a chance to rewrite your story.', NULL, 'motivation'),
  ('You''ve survived 100% of your worst days. You''re doing better than you think.', NULL, 'motivation');
