
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NTgzNTY2MCwiZXhwIjo0OTMxNTA5MjYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o'
)

async function check() {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('whatsapp_outbound_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
  
  if (error) console.error(error)
  else console.log(`Found ${data.length} pending items that should have been sent:`, JSON.stringify(data, null, 2))
}

check()
