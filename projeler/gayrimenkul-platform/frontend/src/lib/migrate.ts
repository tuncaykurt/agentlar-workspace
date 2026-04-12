/**
 * Otomatik Migration Runner
 * Supabase REST API (pg-meta) üzerinden SQL çalıştırır.
 * DATABASE_URL gerektirmez — SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY yeterli.
 */

interface Migration {
  id: string
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    id: '001_initial_schema',
    sql: `
DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin','manager','consultant'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE client_type AS ENUM ('buyer','seller','both','investor','tenant','landlord'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE lead_status AS ENUM ('new','contacted','qualified','negotiating','won','lost','dormant'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE property_status AS ENUM ('active','under_offer','sold','rented','withdrawn'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE property_type AS ENUM ('apartment','villa','land','commercial','office','shop','warehouse','detached_house'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE listing_source AS ENUM ('manual','sahibinden','cb_com_tr','hepsiemlak','emlakjet','zingat','referral','walk_in','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE interaction_channel AS ENUM ('whatsapp','email','call_inbound','call_outbound','sms','meeting','note'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE interaction_direction AS ENUM ('inbound','outbound','internal'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE document_type AS ENUM ('authorization','sales_contract','rental_contract','offer_letter','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE signature_status AS ENUM ('draft','sent','viewed','signed','declined','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE follow_up_status AS ENUM ('pending','sent','done','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE social_platform AS ENUM ('instagram','facebook','linkedin','twitter'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE post_status AS ENUM ('draft','scheduled','posted','failed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE campaign_status AS ENUM ('draft','scheduled','sending','completed','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE commission_status AS ENUM ('pending','confirmed','paid','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE expense_category AS ENUM ('marketing','transport','office','training','meal','gift','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'consultant',
  commission_rate NUMERIC(5,2) DEFAULT 0,
  profile_photo_url TEXT,
  tax_number TEXT, id_number TEXT, address TEXT, bio TEXT,
  authorization_doc_url TEXT, tax_certificate_url TEXT, id_front_url TEXT, id_back_url TEXT,
  certifications JSONB DEFAULT '[]'::jsonb,
  instagram_handle TEXT, facebook_page TEXT, linkedin_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT, email TEXT,
  client_type client_type NOT NULL DEFAULT 'buyer',
  assigned_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  lead_status lead_status NOT NULL DEFAULT 'new',
  source listing_source DEFAULT 'other',
  source_detail TEXT,
  budget_min NUMERIC(15,2), budget_max NUMERIC(15,2),
  preferred_cities TEXT[], preferred_districts TEXT[],
  preferred_property_types property_type[],
  min_m2 INTEGER, max_m2 INTEGER, min_rooms INTEGER,
  notes TEXT, tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  price NUMERIC(15,2), price_negotiable BOOLEAN DEFAULT false, currency TEXT DEFAULT 'TRY',
  city TEXT, district TEXT, neighborhood TEXT, address TEXT,
  latitude NUMERIC(10,7), longitude NUMERIC(10,7),
  property_type property_type NOT NULL DEFAULT 'apartment',
  status property_status NOT NULL DEFAULT 'active',
  m2_gross INTEGER, m2_net INTEGER, room_count TEXT, bathroom_count INTEGER,
  floor INTEGER, total_floors INTEGER, age INTEGER, heating_type TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  photos TEXT[] DEFAULT '{}', video_url TEXT,
  source listing_source DEFAULT 'manual', source_url TEXT, source_listing_id TEXT,
  assigned_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  seller_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  view_count INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT true,
  listed_at TIMESTAMPTZ DEFAULT now(), sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  channel interaction_channel NOT NULL,
  direction interaction_direction NOT NULL DEFAULT 'outbound',
  content TEXT, duration_seconds INTEGER, recording_url TEXT, whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL, channel interaction_channel DEFAULT 'whatsapp',
  message_template TEXT, custom_message TEXT,
  status follow_up_status DEFAULT 'pending', sent_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  sale_price NUMERIC(15,2) NOT NULL,
  total_commission_rate NUMERIC(5,2) NOT NULL, total_commission_amount NUMERIC(15,2),
  office_share_rate NUMERIC(5,2), office_share_amount NUMERIC(15,2),
  consultant_share_rate NUMERIC(5,2), consultant_share_amount NUMERIC(15,2),
  co_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  co_consultant_share_rate NUMERIC(5,2), co_consultant_share_amount NUMERIC(15,2),
  status commission_status DEFAULT 'pending', paid_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL, category expense_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL, receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES consultants(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ, is_approved BOOLEAN, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type document_type NOT NULL, title TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  template_name TEXT, template_data JSONB DEFAULT '{}'::jsonb,
  pdf_url TEXT, signed_pdf_url TEXT,
  docusign_envelope_id TEXT, docusign_status TEXT,
  signature_status signature_status DEFAULT 'draft',
  sent_at TIMESTAMPTZ, viewed_at TIMESTAMPTZ, signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  content_text TEXT, hashtags TEXT[], image_urls TEXT[], video_url TEXT,
  ai_prompt TEXT, sample_image_url TEXT,
  status post_status DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ, posted_at TIMESTAMPTZ, platform_post_id TEXT,
  likes INTEGER, comments INTEGER, reach INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  target_client_type client_type, target_lead_status lead_status,
  target_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  custom_client_ids UUID[], message_template TEXT NOT NULL, media_url TEXT,
  status campaign_status DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  target_count INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0,
  n8n_execution_id TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone TEXT, status TEXT DEFAULT 'pending', whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ, error_message TEXT, created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS property_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  match_score INTEGER, is_notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ, client_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, client_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value JSONB NOT NULL, description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO settings (key, value, description) VALUES
  ('office_commission_rate', '3.0', 'Varsayılan ofis komisyon oranı (%)'),
  ('default_follow_up_days', '7', 'Varsayılan takip aralığı (gün)'),
  ('whatsapp_welcome_template', '"Merhaba {name}, hoş geldiniz!"', 'WhatsApp karşılama şablonu'),
  ('office_name', '"Gayrimenkul Ofisi"', 'Ofis adı'),
  ('office_phone', '""', 'Ofis telefonu'),
  ('office_address', '""', 'Ofis adresi')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_clients_consultant ON clients(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(lead_status);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_properties_consultant ON properties(assigned_consultant_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_consultant ON follow_ups(consultant_id);
CREATE INDEX IF NOT EXISTS idx_commissions_consultant ON commissions(consultant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_consultant ON expenses(consultant_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_consultant ON social_posts(consultant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_consultant ON campaigns(consultant_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$ LANGUAGE plpgsql;

DO $$ BEGIN CREATE TRIGGER consultants_updated_at BEFORE UPDATE ON consultants FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER follow_ups_updated_at BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER commissions_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;
    `,
  },

  {
    id: '002_rls_policies',
    sql: `
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_matches ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl text; BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('settings','_schema_migrations') LOOP
    EXECUTE format('DROP POLICY IF EXISTS allow_authenticated ON %I', tbl);
    EXECUTE format('CREATE POLICY allow_authenticated ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
    `,
  },

  {
    id: '003_add_salutation',
    sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS salutation TEXT DEFAULT '';`,
  },

  {
    id: '004_add_network_type',
    sql: `ALTER TYPE client_type ADD VALUE IF NOT EXISTS 'network';`,
  },
]

// ─── Runner — Supabase pg-meta API üzerinden ─────────────────────────────────

async function runSQL(sql: string, supabaseUrl: string, serviceKey: string): Promise<void> {
  // pg-meta /query endpoint'i service role key ile SQL çalıştırır
  const metaUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/exec_sql'

  // Önce Supabase'in yerleşik SQL executor'ını dene (Edge Function veya pg-meta)
  // Fallback: doğrudan postgres paketi
  const res = await fetch(metaUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
    },
    body: JSON.stringify({ sql }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SQL hata (${res.status}): ${text}`)
  }
}

export async function runMigrations(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.warn('[migrate] SUPABASE_URL veya SERVICE_ROLE_KEY eksik, migration atlandı.')
    return
  }

  // Supabase JS client ile migration takip tablosu oluştur ve SQL çalıştır
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Migration takip tablosunu oluştur (direkt RPC ile)
  const { error: tableErr } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )`,
  })

  if (tableErr) {
    // exec_sql RPC yoksa Supabase'in sql() metodu ile dene
    console.warn('[migrate] exec_sql RPC yok, pg-meta API deneniyor...')
    await runViaPgMeta(supabase, supabaseUrl, serviceKey)
    return
  }

  // Uygulanmış migration'ları çek
  const { data: applied } = await supabase
    .from('_schema_migrations')
    .select('id')

  const appliedIds = new Set((applied || []).map((r: { id: string }) => r.id))

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue

    console.log(`[migrate] ▶ ${migration.id} uygulanıyor...`)
    const { error } = await supabase.rpc('exec_sql', { sql: migration.sql })
    if (error) {
      console.error(`[migrate] ✗ ${migration.id}:`, error.message)
      continue
    }

    await supabase
      .from('_schema_migrations')
      .insert({ id: migration.id })
      .onConflict('id')
      .ignore()

    console.log(`[migrate] ✓ ${migration.id} tamamlandı.`)
  }
}

// pg-meta API üzerinden SQL çalıştır (Supabase self-hosted için)
async function runViaPgMeta(
  supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>,
  supabaseUrl: string,
  serviceKey: string,
): Promise<void> {
  // Supabase self-hosted'da pg-meta /query endpoint'i
  const pgMetaUrl = supabaseUrl.replace('kong:8000', 'meta:8080').replace(/\/$/, '')

  async function execSQL(sql: string): Promise<void> {
    const res = await fetch(`${pgMetaUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`${res.status}: ${t}`)
    }
  }

  // Migration takip tablosunu oluştur
  try {
    await execSQL(`CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )`)
  } catch (e) {
    console.error('[migrate] Takip tablosu oluşturulamadı:', e)
    return
  }

  // Uygulanmış migration'ları çek
  const { data: applied } = await supabase
    .from('_schema_migrations')
    .select('id')

  const appliedIds = new Set((applied || []).map((r: { id: string }) => r.id))

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue

    console.log(`[migrate] ▶ ${migration.id} (pg-meta) uygulanıyor...`)
    try {
      await execSQL(migration.sql)
      await supabase
        .from('_schema_migrations')
        .insert({ id: migration.id })
        .onConflict('id')
        .ignore()
      console.log(`[migrate] ✓ ${migration.id} tamamlandı.`)
    } catch (e) {
      console.error(`[migrate] ✗ ${migration.id}:`, e)
    }
  }
}
