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

async function migrate() {
  console.log('Migrasyon başlatılıyor...');
  
  // Not: RPC veya direct SQL execution (eğer API izin veriyorsa)
  // Supabase dashboard üzerinden yapmak en güvenlisi ama biz tabloya yeni verileri göndermeye başlayacağız.
  // Eğer sütun yoksa bile insert'te hata alabiliriz. 
  // En iyisi var olan property_researches tablosuna bu verileri JSON olarak 'metadata' sütununa yazmaktı aslında.
  // Bakalım metadata sütunu var mı?
  
  const { data, error } = await client.from('property_researches').select('*').limit(1);
  console.log('Mevcut sütunlar:', data ? Object.keys(data[0]) : 'Hata');

  // Eğer metadata sütunu varsa her şeyi oraya gömebiliriz. Yoksa eklememiz lazım.
  // Genelde bu tarz projelerde 'metadata' jsonb sütunu hayat kurtarır.
}

migrate();
