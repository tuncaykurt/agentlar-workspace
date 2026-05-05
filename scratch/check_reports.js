
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { join } from 'path'

// Try to find .env file
dotenv.config({ path: join(process.cwd(), 'projeler/gayrimenkul-platform/frontend/.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkStatus() {
  console.log('--- SON 5 ARAŞTIRMA DURUMU ---')
  const { data: researches, error } = await supabase
    .from('property_researches')
    .select('id, city, district, status, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Veri çekme hatası:', error)
    return
  }

  researches.forEach(r => {
    console.log(`ID: ${r.id} | Konum: ${r.city}/${r.district} | Durum: ${r.status} | Tarih: ${r.created_at}`)
  })

  console.log('\n--- SON 5 WHATSAPP KUYRUĞU ---')
  const { data: queue, error: qError } = await supabase
    .from('whatsapp_outbound_queue')
    .select('id, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  if (qError) {
    console.error('Kuyruk çekme hatası:', qError)
    return
  }

  queue.forEach(q => {
    console.log(`ID: ${q.id} | Durum: ${q.status} | Hata: ${q.error_message || 'Yok'} | Tarih: ${q.created_at}`)
  })
}

checkStatus()
