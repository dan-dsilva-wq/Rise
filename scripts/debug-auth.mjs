import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://catxkqtkcytwtevlazcl.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdHhrcXRrY3l0d3RldmxhemNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MDgzNDYsImV4cCI6MjA4Mzk4NDM0Nn0.is8y4IWB__-gh8bpUqJxFUCyJBvF36riwRWLuxhTk9s'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSignup() {
  console.log('Testing signup flow...\n')

  const testEmail = `test-${Date.now()}@example.com`

  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: 'testpassword123',
    options: {
      data: {
        display_name: 'Test User'
      }
    }
  })

  if (error) {
    console.log('Signup error:', error.message)
    console.log('Full error:', JSON.stringify(error, null, 2))
  } else {
    console.log('Signup successful!')
    console.log('User ID:', data.user?.id)

    // Check if profile was created
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError) {
        console.log('\nProfile fetch error:', profileError.message)
      } else {
        console.log('\nProfile created:', profile)
      }
    }
  }
}

testSignup().catch(console.error)
