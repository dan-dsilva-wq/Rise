-- Rise App Tables (run in Supabase Dashboard > SQL Editor)
-- This creates only the Rise-specific tables, not achievements/daily_prompts which already exist

-- Enable UUID extension (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PROFILES TABLE (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  timezone TEXT DEFAULT 'UTC',
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  unlock_tier INTEGER DEFAULT 1,
  grace_days_used_this_week INTEGER DEFAULT 0,
  week_start_date DATE DEFAULT CURRENT_DATE,
  partner_sharing_enabled BOOLEAN DEFAULT FALSE,
  partner_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY_LOGS TABLE
CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  log_date DATE NOT NULL,
  wake_time TIMESTAMPTZ,
  im_up_pressed_at TIMESTAMPTZ,
  time_to_rise_minutes INTEGER,
  morning_energy INTEGER CHECK (morning_energy >= 1 AND morning_energy <= 10),
  morning_mood INTEGER CHECK (morning_mood >= 1 AND morning_mood <= 10),
  feet_on_floor BOOLEAN DEFAULT FALSE,
  light_exposure BOOLEAN DEFAULT FALSE,
  drank_water BOOLEAN DEFAULT FALSE,
  evening_energy INTEGER CHECK (evening_energy >= 1 AND evening_energy <= 10),
  evening_mood INTEGER CHECK (evening_mood >= 1 AND evening_mood <= 10),
  day_rating INTEGER CHECK (day_rating >= 1 AND day_rating <= 10),
  movement_minutes INTEGER DEFAULT 0,
  went_outside BOOLEAN DEFAULT FALSE,
  gratitude_entry TEXT,
  reflection_notes TEXT,
  xp_earned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

-- HABITS TABLE
CREATE TABLE IF NOT EXISTS habits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '✓',
  description TEXT,
  frequency TEXT DEFAULT 'daily',
  frequency_days INTEGER[] DEFAULT '{1,2,3,4,5,6,7}',
  anchor_habit_id UUID REFERENCES habits(id),
  anchor_position TEXT CHECK (anchor_position IN ('before', 'after')),
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  xp_value INTEGER DEFAULT 25,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HABIT_COMPLETIONS TABLE
CREATE TABLE IF NOT EXISTS habit_completions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  completion_date DATE NOT NULL,
  xp_earned INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, completion_date)
);

-- USER_ACHIEVEMENTS TABLE
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_habit_completions_user_date ON habit_completions(user_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for daily_logs
DROP POLICY IF EXISTS "Users can view own daily_logs" ON daily_logs;
CREATE POLICY "Users can view own daily_logs" ON daily_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own daily_logs" ON daily_logs;
CREATE POLICY "Users can insert own daily_logs" ON daily_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily_logs" ON daily_logs;
CREATE POLICY "Users can update own daily_logs" ON daily_logs FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for habits
DROP POLICY IF EXISTS "Users can view own habits" ON habits;
CREATE POLICY "Users can view own habits" ON habits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own habits" ON habits;
CREATE POLICY "Users can insert own habits" ON habits FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own habits" ON habits;
CREATE POLICY "Users can update own habits" ON habits FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own habits" ON habits;
CREATE POLICY "Users can delete own habits" ON habits FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for habit_completions
DROP POLICY IF EXISTS "Users can view own habit_completions" ON habit_completions;
CREATE POLICY "Users can view own habit_completions" ON habit_completions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own habit_completions" ON habit_completions;
CREATE POLICY "Users can insert own habit_completions" ON habit_completions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_achievements
DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
CREATE POLICY "Users can view own achievements" ON user_achievements FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own achievements" ON user_achievements;
CREATE POLICY "Users can insert own achievements" ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);

-- FUNCTIONS

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger (drop first if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Timestamp triggers
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS daily_logs_updated_at ON daily_logs;
CREATE TRIGGER daily_logs_updated_at BEFORE UPDATE ON daily_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS habits_updated_at ON habits;
CREATE TRIGGER habits_updated_at BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Increment XP function
CREATE OR REPLACE FUNCTION increment_xp(p_user_id UUID, xp_amount INTEGER)
RETURNS void AS $$
DECLARE
  new_total_xp INTEGER;
  new_level INTEGER;
  new_tier INTEGER;
BEGIN
  SELECT total_xp + xp_amount INTO new_total_xp FROM profiles WHERE id = p_user_id;

  new_level := CASE
    WHEN new_total_xp >= 22000 THEN 20
    WHEN new_total_xp >= 18500 THEN 19
    WHEN new_total_xp >= 15500 THEN 18
    WHEN new_total_xp >= 13000 THEN 17
    WHEN new_total_xp >= 11000 THEN 16
    WHEN new_total_xp >= 9200 THEN 15
    WHEN new_total_xp >= 7600 THEN 14
    WHEN new_total_xp >= 6200 THEN 13
    WHEN new_total_xp >= 5000 THEN 12
    WHEN new_total_xp >= 4000 THEN 11
    WHEN new_total_xp >= 3200 THEN 10
    WHEN new_total_xp >= 2500 THEN 9
    WHEN new_total_xp >= 1900 THEN 8
    WHEN new_total_xp >= 1400 THEN 7
    WHEN new_total_xp >= 1000 THEN 6
    WHEN new_total_xp >= 700 THEN 5
    WHEN new_total_xp >= 450 THEN 4
    WHEN new_total_xp >= 250 THEN 3
    WHEN new_total_xp >= 100 THEN 2
    ELSE 1
  END;

  new_tier := CASE
    WHEN new_total_xp >= 10000 THEN 5
    WHEN new_total_xp >= 4000 THEN 4
    WHEN new_total_xp >= 1500 THEN 3
    WHEN new_total_xp >= 500 THEN 2
    ELSE 1
  END;

  UPDATE profiles SET total_xp = new_total_xp, current_level = new_level, unlock_tier = new_tier, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
