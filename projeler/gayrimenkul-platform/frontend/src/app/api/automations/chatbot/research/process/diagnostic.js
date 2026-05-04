const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = 'c:/Users/user/Desktop/Antigravity/projeler/gayrimenkul-platform/frontend/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');

function getEnv(key) {
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      return line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
  return null;
}

const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

const client = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('\n--- SON ARAŞTIRMA TALEPLERİ ---');
  const { data: research, error: resErr } = await client
    .from('property_research_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (resErr) console.error('Research Error:', resErr);
  else console.table(research.map(r => ({ id: r.id, phone: r.customer_phone, city: r.city, status: r.status, created: r.created_at })));

  console.log('\n--- KUYRUKTAKİ BEKLEYEN RAPORLAR ---');
  const { data: queue, error: qErr } = await client
    .from('whatsapp_outbound_queue')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (qErr) console.error('Queue Error:', qErr);
  else console.table(queue.map(q => ({ id: q.id, phone: q.customer_phone, status: q.status, scheduled: q.scheduled_at })));
}

check();
