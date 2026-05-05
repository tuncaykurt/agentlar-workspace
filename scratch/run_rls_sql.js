const axios = require('axios');

const SUPABASE_URL = 'https://gayrimenkul-supabase.yapayzekaotomasyon.cloud';
const SERVICE_ROLE_KEY = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc3NTgzNTY2MCwiZXhwIjo0OTMxNTA5MjYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.PAOT09M4b_1PdBs6SP68FKSyzpStWhecc6XxKTrA21o';

const sql = `
-- Allow public (anon) read access to property researches
DROP POLICY IF EXISTS "Public read access on property_researches" ON property_researches;
CREATE POLICY "Public read access on property_researches" 
ON property_researches 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Allow public (anon) read access to consultants basic info
DROP POLICY IF EXISTS "Public read access on consultants for reports" ON consultants;
CREATE POLICY "Public read access on consultants for reports" 
ON consultants 
FOR SELECT 
TO anon, authenticated 
USING (true);
`;

async function runSql() {
  try {
    const response = await axios.post(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, 
      { sql },
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('SQL executed successfully:', response.data);
  } catch (err) {
    console.error('Error executing SQL:', err.response ? err.response.data : err.message);
  }
}

runSql();
