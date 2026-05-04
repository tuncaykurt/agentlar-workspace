
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud',
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NTgzNTY2MCwiZXhwIjo0OTMxNTA5MjYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o'
)

async function check() {
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) console.error(error)
  else console.log(JSON.stringify(data, null, 2))
}

check()
