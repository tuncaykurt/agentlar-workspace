const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud';
const supabaseKey = 'PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o'; // service role key

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkReport() {
  const id = '2bbe0f2d-daa8-4d34-a644-c179aaecdda1';
  console.log(`Checking report ID: ${id}`);
  
  const { data, error } = await supabase
    .from('property_researches')
    .select('*, consultants(full_name)')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching report:', error.message);
  } else {
    console.log('Report found:', JSON.stringify(data, null, 2));
  }
}

checkReport();
