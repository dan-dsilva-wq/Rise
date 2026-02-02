// Script to check database tables and run migrations if needed
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://catxkqtkcytwtevlazcl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdHhrcXRrY3l0d3RldmxhemNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDgzNDYsImV4cCI6MjA4Mzk4NDM0Nn0.is8y4IWB__-gh8bpUqJxFUCyJBvF36riwRWLuxhTk9s'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkTables() {
  console.log('Checking Rise database tables...\n')

  // Try to query each table to see if it exists
  const tables = ['profiles', 'daily_logs', 'habits', 'habit_completions', 'achievements', 'user_achievements', 'daily_prompts']

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1)
    if (error) {
      console.log(`  ${table}: NOT FOUND or ERROR - ${error.message}`)
    } else {
      console.log(`  ${table}: EXISTS (${data.length} sample rows)`)
    }
  }

  // Check if achievements have seed data
  const { data: achievements } = await supabase.from('achievements').select('code')
  if (achievements && achievements.length > 0) {
    console.log(`\nAchievements seed data: ${achievements.length} achievements found`)
  }

  // Check if daily_prompts have seed data
  const { data: prompts } = await supabase.from('daily_prompts').select('id')
  if (prompts && prompts.length > 0) {
    console.log(`Daily prompts seed data: ${prompts.length} prompts found`)
  }
}

checkTables().catch(console.error)
