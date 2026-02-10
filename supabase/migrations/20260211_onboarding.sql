-- Add onboarding tracking to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_onboarded BOOLEAN DEFAULT FALSE;
