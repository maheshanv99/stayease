import { createClient } from '@supabase/supabase-js'

// Your StayEase Supabase project credentials
const supabaseUrl = 'https://zgotelbhggzmwvflopbx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnb3RlbGJoZ2d6bXd2ZmxvcGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NzAyMjEsImV4cCI6MjA5NzM0NjIyMX0.EOI9o66KgL2pp6CV9LCS0Hf_Nj0QzXPKvlc3PUe7DzI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
