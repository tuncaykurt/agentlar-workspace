
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE property_researches ADD COLUMN IF NOT EXISTS structured_data JSONB;'
  }).catch(() => ({ error: { message: 'RPC not found, trying query' }}))

  if (error) {
    console.log('Trying direct query...')
    // If RPC fails, we can't do much from here easily without a specialized tool
    // but I'll assume I can just use the provided sql tool if I fix quoting
  }
}
main()
