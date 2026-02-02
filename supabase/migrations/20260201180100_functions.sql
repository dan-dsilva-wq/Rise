-- Rise App Database Functions
-- ================================

-- Increment user XP and update level/tier
CREATE OR REPLACE FUNCTION increment_xp(user_id UUID, xp_amount INTEGER)
RETURNS void AS $$
DECLARE
  new_total_xp INTEGER;
  new_level INTEGER;
  new_tier INTEGER;
BEGIN
  -- Get current XP and add the new amount
  SELECT total_xp + xp_amount INTO new_total_xp
  FROM profiles
  WHERE id = user_id;

  -- Calculate new level
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

  -- Calculate new tier
  new_tier := CASE
    WHEN new_total_xp >= 10000 THEN 5
    WHEN new_total_xp >= 4000 THEN 4
    WHEN new_total_xp >= 1500 THEN 3
    WHEN new_total_xp >= 500 THEN 2
    ELSE 1
  END;

  -- Update the profile
  UPDATE profiles
  SET
    total_xp = new_total_xp,
    current_level = new_level,
    unlock_tier = new_tier,
    updated_at = NOW()
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update streak when logging in
CREATE OR REPLACE FUNCTION update_streak(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  last_log_date DATE;
  current_streak INTEGER;
  new_streak INTEGER;
  grace_available BOOLEAN;
BEGIN
  -- Get the most recent log date (excluding today)
  SELECT log_date INTO last_log_date
  FROM daily_logs
  WHERE daily_logs.user_id = update_streak.user_id
    AND log_date < CURRENT_DATE
  ORDER BY log_date DESC
  LIMIT 1;

  -- Get current streak info
  SELECT p.current_streak, (p.grace_days_used_this_week < 1)
  INTO current_streak, grace_available
  FROM profiles p
  WHERE p.id = update_streak.user_id;

  -- Calculate new streak
  IF last_log_date IS NULL THEN
    -- First ever log
    new_streak := 1;
  ELSIF last_log_date = CURRENT_DATE - INTERVAL '1 day' THEN
    -- Consecutive day
    new_streak := current_streak + 1;
  ELSIF last_log_date = CURRENT_DATE - INTERVAL '2 days' AND grace_available THEN
    -- Missed one day, use grace day
    new_streak := current_streak + 1;
    -- Mark grace day as used
    UPDATE profiles
    SET grace_days_used_this_week = 1
    WHERE id = update_streak.user_id;
  ELSE
    -- Streak broken
    new_streak := 1;
  END IF;

  -- Update profile with new streak
  UPDATE profiles
  SET
    current_streak = new_streak,
    longest_streak = GREATEST(longest_streak, new_streak),
    updated_at = NOW()
  WHERE id = update_streak.user_id;

  RETURN new_streak;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset grace days at start of week
CREATE OR REPLACE FUNCTION reset_weekly_grace_days()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET
    grace_days_used_this_week = 0,
    week_start_date = CURRENT_DATE
  WHERE week_start_date < date_trunc('week', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
