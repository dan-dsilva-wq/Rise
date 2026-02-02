import pg from 'pg'
import dns from 'dns'

// Force IPv4
dns.setDefaultResultOrder('ipv4first')

const { Client } = pg

const client = new Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.catxkqtkcytwtevlazcl',
  password: '6&%esZS/j-/7ZfD',
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
