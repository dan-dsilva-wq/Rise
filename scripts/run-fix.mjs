import pg from 'pg'
import dns from 'dns'

// Force IPv4
dns.setDefaultResultOrder('ipv4first')

const { Client } = pg

const {
  SUPABASE_DB_HOST,
  SUPABASE_DB_PORT,
  SUPABASE_DB_NAME,
  SUPABASE_DB_USER,
  SUPABASE_DB_PASSWORD,
} = process.env

if (!SUPABASE_DB_HOST || !SUPABASE_DB_USER || !SUPABASE_DB_PASSWORD) {
  throw new Error(
    'Missing required DB env vars. Set SUPABASE_DB_HOST, SUPABASE_DB_USER, and SUPABASE_DB_PASSWORD.'
  )
}

const client = new Client({
  host: SUPABASE_DB_HOST,
  port: Number(SUPABASE_DB_PORT || 6543),
  database: SUPABASE_DB_NAME || 'postgres',
  user: SUPABASE_DB_USER,
  password: SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
})

const sql = `
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`

async function run() {
  try {
    console.log('Connecting to database...')
    await client.connect()
    console.log('Connected! Running fix...')
    await client.query(sql)
    console.log('Trigger function updated successfully!')
    await client.end()
  } catch (err) {
    console.error('Error:', err.message)
  }
}

run()
