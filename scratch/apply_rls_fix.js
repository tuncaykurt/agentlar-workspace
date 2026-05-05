const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:Vk2GPS0eUNv2hc3GqDq6pscVY2ZRf8WT@72.60.129.158:5432/postgres';

async function applyMigration() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to database');
    
    const migrationPath = path.join(__dirname, '../projeler/gayrimenkul-platform/supabase/migrations/021_public_research_access.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration...');
    await client.query(sql);
    console.log('Migration applied successfully');
  } catch (err) {
    console.error('Error applying migration:', err.message);
  } finally {
    await client.end();
  }
}

applyMigration();
