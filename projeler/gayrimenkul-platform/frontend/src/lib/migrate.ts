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
  ('office_name', '"Ambiance Gayrimenkul"', 'Ofis adı'),
  ('office_phone', '""', 'Ofis telefonu'),
  ('office_address', '"Ahmet Yesevi Mah. Hudut Sok. Central Balat Sitesi 1/C\nNilüfer / BURSA"', 'Ofis adresi'),
  ('office_logo', '""', 'Logo URL')
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

  {
    id: '006_consultant_whatsapp',
    sql: `
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS wa_instance TEXT;
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS wa_phone TEXT;
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS wa_connected_at TIMESTAMPTZ;
    `,
  },

  {
    id: '005_signature_requests',
    sql: `
CREATE TABLE IF NOT EXISTS signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  signer_name TEXT NOT NULL,
  signer_phone TEXT,
  signer_role TEXT NOT NULL DEFAULT 'main',
  token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  signature_data TEXT,
  signature_type TEXT DEFAULT 'drawn',
  ip_address TEXT,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  wa_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS allow_authenticated_sig ON signature_requests;
  CREATE POLICY allow_authenticated_sig ON signature_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS allow_anon_sig_token ON signature_requests;
  CREATE POLICY allow_anon_sig_token ON signature_requests FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS allow_anon_sig_update ON signature_requests;
  CREATE POLICY allow_anon_sig_update ON signature_requests FOR UPDATE TO anon USING (status = 'pending' OR status = 'viewed') WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO settings (key, value, description) VALUES
  ('evolution_api_url', '""', 'Evolution API URL (ör: https://evo.domain.com)'),
  ('evolution_api_key', '""', 'Evolution API key'),
  ('evolution_instance', '""', 'Evolution instance adı'),
  ('app_url', '""', 'Uygulamanın dış URL''i (imza linkleri için, ör: https://crm.domain.com)')
ON CONFLICT (key) DO NOTHING;
    `,
  },

  {
    id: '007_client_tc_address',
    sql: `
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tc_no TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;
    `,
  },

  {
    id: '009_property_deposit_dues_field',
    sql: `
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deposit NUMERIC(15,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS dues NUMERIC(10,2);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS source_listing_id TEXT;
DO $$ BEGIN ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'field'; EXCEPTION WHEN duplicate_object THEN null; END $$;
    `,
  },

  {
    id: '010_office_sync',
    sql: `
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS office_source_url TEXT;
CREATE INDEX IF NOT EXISTS idx_properties_source_listing_id ON properties(source_listing_id);
CREATE INDEX IF NOT EXISTS idx_properties_last_seen ON properties(last_seen_at);

INSERT INTO settings (key, value, description) VALUES
  ('office_sahibinden_url', '""', 'Ofis Sahibinden mağaza/ilan listesi URL (günlük senkronizasyon için)'),
  ('office_sync_cron_secret', '""', 'Cron endpoint auth secret (x-cron-secret header)'),
  ('office_sync_last_run', '""', 'Son senkronizasyon zamanı (otomatik güncellenir)'),
  ('office_sync_last_result', '""', 'Son senkron sonucu (otomatik güncellenir)')
ON CONFLICT (key) DO NOTHING;
    `,
  },

  {
    id: '008b_office_settings_ambiance',
    sql: `
INSERT INTO settings (key, value, description) VALUES
  ('office_name', '"Ambiance Gayrimenkul"', 'Ofis adı'),
  ('office_address', '"Ahmet Yesevi Mah. Hudut Sok. Central Balat Sitesi 1/C\nNilüfer / BURSA"', 'Ofis adresi'),
  ('office_logo', '""', 'Logo URL (Supabase Storage veya CDN)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
    `,
  },

  {
    id: '013_features_and_credits',
    sql: `
-- Feature Flags
CREATE TABLE IF NOT EXISTS feature_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  route TEXT,
  sort_order INTEGER DEFAULT 0,
  enabled_for_roles TEXT[] DEFAULT '{consultant,manager}',
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultant_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES feature_config(feature_key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(consultant_id, feature_key)
);

INSERT INTO feature_config (feature_key, label, description, icon, route, sort_order, enabled_for_roles, is_enabled) VALUES
  ('dashboard',      'Dashboard',           'Ana gösterge paneli',                'LayoutDashboard', '/dashboard',      1,  '{consultant,manager}', true),
  ('crm',            'CRM',                 'Müşteri ilişkileri yönetimi',        'Users',           '/crm',            2,  '{consultant,manager}', true),
  ('rehber',         'Rehber',              'İletişim rehberi',                    'BookUser',        '/rehber',         3,  '{consultant,manager}', true),
  ('documents',      'Belgeler',            'Belge oluşturma ve imzalama',        'FileText',        '/documents',      4,  '{consultant,manager}', true),
  ('portfolio',      'Portföy',             'Gayrimenkul portföy yönetimi',       'Building2',       '/portfolio',      5,  '{consultant,manager}', false),
  ('sahibinden',     'Sahibinden İlanlar',  'Sahibinden ilan takibi',             'Store',           '/sahibinden',     6,  '{consultant,manager}', false),
  ('finance',        'Finans',              'Komisyon ve gider takibi',           'DollarSign',      '/finance',        7,  '{consultant,manager}', false),
  ('communications', 'İletişim',            'WhatsApp ve mesaj yönetimi',         'MessageSquare',   '/communications', 8,  '{consultant,manager}', false),
  ('campaigns',      'Kampanyalar',         'Toplu mesaj kampanyaları',           'Megaphone',       '/campaigns',      9,  '{consultant,manager}', false),
  ('social',         'Sosyal Medya',        'Sosyal medya yönetimi',             'Share2',          '/social',         10, '{consultant,manager}', false),
  ('piyasa',         'Piyasa',              'Piyasa analizi',                     'TrendingUp',      '/piyasa',         11, '{consultant,manager}', false)
ON CONFLICT (feature_key) DO NOTHING;

-- Kredi Sistemi
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_by UUID REFERENCES consultants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_consultant ON credit_transactions(consultant_id, created_at DESC);

INSERT INTO settings (key, value, description, updated_at) VALUES
  ('initial_free_credits', '5', 'Yeni danışmana verilen ücretsiz kredi sayısı', now()),
  ('credit_cost_per_document', '1', 'Belge başına kredi maliyeti', now())
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE feature_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "feature_config_select" ON feature_config FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "feature_config_admin_all" ON feature_config FOR ALL USING (
    EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "cfo_select" ON consultant_feature_overrides FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "cfo_admin_all" ON consultant_feature_overrides FOR ALL USING (
    EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "credit_tx_select" ON credit_transactions FOR SELECT USING (
    consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "credit_tx_insert" ON credit_transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE OR REPLACE TRIGGER feature_config_updated_at
  BEFORE UPDATE ON feature_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `,
  },
  {
    id: '014_user_registration_trigger',
    sql: `
-- Trigger to automatically create a consultant profile when a new user signs up

-- The function creates a new record in consultants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.consultants (user_id, full_name, email, role, is_active)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Yeni Kullanıcı'),
    new.email,
    'consultant',
    false -- admin onaylayana kadar pasif
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `,
  },
  {
    id: '015_kyc_didit',
    sql: `
ALTER TABLE documents ADD COLUMN IF NOT EXISTS kyc_required BOOLEAN DEFAULT FALSE;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kyc_session_id TEXT;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kyc_status TEXT;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
    `,
  },
  {
    id: '016_kvkk_consent',
    sql: `
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kvkk_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kvkk_consent_at TIMESTAMPTZ;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS kyc_data JSONB;
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS kvkk_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS kvkk_consent_at TIMESTAMPTZ;
    `,
  },
  {
    id: '017_otp_verification',
    sql: `
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS otp_code TEXT;
ALTER TABLE signature_requests ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
    `,
  },
  {
    id: '018_client_birth_date',
    sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS birth_date DATE;`,
  },
  {
    id: '020_consultant_extra_columns',
    sql: `
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS office_phone TEXT;
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS ticari_yetki_belgesi_no TEXT;
    `,
  },
  {
    id: '021_consultant_docs_bucket',
    sql: `
INSERT INTO storage.buckets (id, name, public)
VALUES ('consultant-docs', 'consultant-docs', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  DROP POLICY IF EXISTS "consultant_docs_upload" ON storage.objects;
  CREATE POLICY "consultant_docs_upload" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'consultant-docs');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "consultant_docs_update" ON storage.objects;
  CREATE POLICY "consultant_docs_update" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'consultant-docs');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "consultant_docs_read" ON storage.objects;
  CREATE POLICY "consultant_docs_read" ON storage.objects
    FOR SELECT USING (bucket_id = 'consultant-docs');
EXCEPTION WHEN duplicate_object THEN null; END $$;
    `,
  },
  {
    id: '022_birthday_automation',
    sql: `
CREATE TABLE IF NOT EXISTS birthday_automation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  trigger_time TEXT DEFAULT '09:00',
  system_prompt TEXT DEFAULT 'Sen yardımsever bir gayrimenkul danışmanı asistanısın. Müşterilere kısa, samimi ve kişisel doğum günü mesajları yazıyorsun.',
  message_template TEXT DEFAULT 'Merhaba {hitap} {ad}, doğum gününüz kutlu olsun! 🎂',
  contact_filter TEXT DEFAULT 'all',
  selected_contact_ids UUID[] DEFAULT ARRAY[]::UUID[],
  last_run_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(consultant_id)
);
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS last_run_date DATE;
    `,
  },
  {
    id: '024_chatbot_model',
    sql: `
ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS selected_model TEXT DEFAULT 'anthropic/claude-haiku-4-5';
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS selected_model TEXT DEFAULT '';
    `,
  },
  {
    id: '023b_whatsapp_chatbot',
    sql: `
CREATE TABLE IF NOT EXISTS whatsapp_chatbot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE UNIQUE,
  is_enabled BOOLEAN DEFAULT false,
  auto_reply_enabled BOOLEAN DEFAULT true,
  system_prompt TEXT DEFAULT 'Sen yardımsever bir gayrimenkul danışmanı asistanısın. Müşterilerin sorularını kısa, samimi ve profesyonel bir şekilde yanıtlıyorsun. Mülk alım-satım, kiralama konularında yardımcı oluyorsun.',
  working_hours_enabled BOOLEAN DEFAULT false,
  working_hours_start TEXT DEFAULT '09:00',
  working_hours_end TEXT DEFAULT '18:00',
  outside_hours_message TEXT DEFAULT 'Mesai saatlerimiz dışındasınız. Yarın 09:00''da size döneceğiz.',
  max_history_messages INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_consultant_phone
  ON whatsapp_chat_history(consultant_id, customer_phone, created_at);
    `,
  },
  {
    id: '019_fix_rls_all_tables',
    sql: `
DO $$ DECLARE tbl text; BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_schema_migrations')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS allow_authenticated ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY allow_authenticated ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;
    `,
  },
  {
    id: '050_webhook_logs',
    sql: `
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'whatsapp',
  event TEXT,
  instance TEXT,
  payload JSONB,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at DESC);
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON webhook_logs;
CREATE POLICY allow_authenticated ON webhook_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `,
  },
  {
    id: '051_chatbot_personality_tools',
    sql: `
ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS personality_preset TEXT DEFAULT 'samimi';
ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) DEFAULT 0.7;
ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS example_dialogues TEXT DEFAULT '';
ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS enabled_tools JSONB DEFAULT '[]'::jsonb;

ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS personality_preset TEXT DEFAULT 'samimi';
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) DEFAULT 0.8;
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS example_dialogues TEXT DEFAULT '';
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS enabled_tools JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS chatbot_custom_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'chatbot',
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  parameters_json JSONB NOT NULL DEFAULT '{"type":"object","properties":{}}'::jsonb,
  action_type TEXT NOT NULL DEFAULT 'sql_select',
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE chatbot_custom_tools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON chatbot_custom_tools;
CREATE POLICY allow_authenticated ON chatbot_custom_tools FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  customer_phone TEXT,
  customer_name TEXT,
  appointment_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON appointments;
CREATE POLICY allow_authenticated ON appointments FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `,
  },
  {
    id: '052_message_queue',
    sql: `
CREATE TABLE IF NOT EXISTS chatbot_message_queue (
  consultant_id UUID NOT NULL,
  customer_phone TEXT NOT NULL,
  last_msg_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consultant_id, customer_phone)
);
ALTER TABLE chatbot_message_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON chatbot_message_queue;
CREATE POLICY allow_authenticated ON chatbot_message_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE whatsapp_chatbot_config ADD COLUMN IF NOT EXISTS debounce_seconds INTEGER DEFAULT 5;
ALTER TABLE birthday_automation_config ADD COLUMN IF NOT EXISTS debounce_seconds INTEGER DEFAULT 5;
    `,
  },
  {
    id: '054_multi_tenant_brokers',
    sql: `
-- ─── BROKER ROLE & MULTI-TENANT BACKBONE ─────────────────────────────────────
-- broker rolünü user_role enum'una ekle (admin/manager/consultant + broker)
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'broker';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── BRANDS (franchise / marka) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  hq_share_rate NUMERIC(5,2) NOT NULL DEFAULT 9.00,
  hq_contact_name TEXT,
  hq_contact_email TEXT,
  hq_contact_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN CREATE TRIGGER brands_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO brands (name, hq_share_rate)
VALUES ('Bağımsız', 0.00)
ON CONFLICT (name) DO NOTHING;

-- ─── OFFICES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_no TEXT,
  logo_url TEXT,
  -- Default paylaşım oranları
  default_office_share_rate NUMERIC(5,2) NOT NULL DEFAULT 50.00, -- ofis (HQ sonrası)
  default_consultant_share_rate NUMERIC(5,2) NOT NULL DEFAULT 50.00, -- danışman (HQ sonrası)
  default_total_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 3.00, -- müşteriden alınan
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN CREATE TRIGGER offices_updated_at BEFORE UPDATE ON offices FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Mevcut tek-ofis verisinden default ofis oluştur
INSERT INTO offices (id, brand_id, name, address, default_office_share_rate, default_consultant_share_rate, default_total_commission_rate)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  (SELECT id FROM brands WHERE name = 'Bağımsız' LIMIT 1),
  COALESCE((SELECT (value #>> '{}')::text FROM settings WHERE key = 'office_name'), 'Ana Ofis'),
  COALESCE((SELECT (value #>> '{}')::text FROM settings WHERE key = 'office_address'), ''),
  50.00, 50.00, 3.00
ON CONFLICT (id) DO NOTHING;

-- ─── OFFICE MEMBERSHIPS (transfer geçmişi) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS office_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  role user_role NOT NULL DEFAULT 'consultant', -- consultant | manager | broker
  -- Bu üyelik için bu ofiste alınan komisyon oranı (override)
  commission_rate_override NUMERIC(5,2),
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ, -- NULL = aktif
  end_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_om_consultant_active ON office_memberships(consultant_id) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_om_office_active ON office_memberships(office_id) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_om_consultant_history ON office_memberships(consultant_id, start_date DESC);

-- Tüm mevcut consultant'ları default ofise üye yap (idempotent)
INSERT INTO office_memberships (consultant_id, office_id, role, start_date)
SELECT
  c.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  c.role,
  COALESCE(c.created_at, now())
FROM consultants c
WHERE NOT EXISTS (
  SELECT 1 FROM office_memberships om
  WHERE om.consultant_id = c.id AND om.end_date IS NULL
)
ON CONFLICT DO NOTHING;

-- ─── HELPER: bir consultant'ın aktif ofisi ────────────────────────────────────
CREATE OR REPLACE FUNCTION current_office_of_consultant(p_consultant_id UUID)
RETURNS UUID AS $fn$
  SELECT office_id FROM office_memberships
  WHERE consultant_id = p_consultant_id AND end_date IS NULL
  ORDER BY start_date DESC LIMIT 1;
$fn$ LANGUAGE sql STABLE;

-- ─── OFFICE_ID KOLONLARI (mevcut tablolara) ───────────────────────────────────
ALTER TABLE properties      ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE clients         ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE commissions     ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE documents       ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE expenses        ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE interactions    ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE follow_ups      ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE social_posts    ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;
ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES offices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_office   ON properties(office_id);
CREATE INDEX IF NOT EXISTS idx_clients_office      ON clients(office_id);
CREATE INDEX IF NOT EXISTS idx_commissions_office  ON commissions(office_id);
CREATE INDEX IF NOT EXISTS idx_documents_office    ON documents(office_id);

-- Mevcut kayıtları default ofise damgala (immutable damga — sadece NULL'lar için)
UPDATE properties   SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE clients      SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE commissions  SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE documents    SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE expenses     SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE interactions SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE follow_ups   SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE social_posts SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;
UPDATE campaigns    SET office_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE office_id IS NULL;

-- ─── BEFORE INSERT TRIGGER: office_id otomatik damga ──────────────────────────
-- Kayıt oluşturulduğunda consultant'ın O ANKİ ofisini damgalar (transfer sonrası eski kayıtların office_id'si değişmez)
-- Tablolar için: consultant_id kolonuna sahip olanlar (commissions, documents, expenses, interactions, follow_ups, social_posts, campaigns, sales_closings)
CREATE OR REPLACE FUNCTION stamp_office_id()
RETURNS TRIGGER AS $fn$
DECLARE
  oid UUID;
BEGIN
  IF NEW.office_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.consultant_id IS NULL THEN
    NEW.office_id := '00000000-0000-0000-0000-000000000001'::uuid;
    RETURN NEW;
  END IF;
  oid := current_office_of_consultant(NEW.consultant_id);
  NEW.office_id := COALESCE(oid, '00000000-0000-0000-0000-000000000001'::uuid);
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Properties: assigned_consultant_id alanını kullanır
CREATE OR REPLACE FUNCTION stamp_office_id_properties()
RETURNS TRIGGER AS $fn$
DECLARE oid UUID;
BEGIN
  IF NEW.office_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.assigned_consultant_id IS NULL THEN
    NEW.office_id := '00000000-0000-0000-0000-000000000001'::uuid;
    RETURN NEW;
  END IF;
  oid := current_office_of_consultant(NEW.assigned_consultant_id);
  NEW.office_id := COALESCE(oid, '00000000-0000-0000-0000-000000000001'::uuid);
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Clients: assigned_consultant_id alanını kullanır
CREATE OR REPLACE FUNCTION stamp_office_id_clients()
RETURNS TRIGGER AS $fn$
DECLARE oid UUID;
BEGIN
  IF NEW.office_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.assigned_consultant_id IS NULL THEN
    NEW.office_id := '00000000-0000-0000-0000-000000000001'::uuid;
    RETURN NEW;
  END IF;
  oid := current_office_of_consultant(NEW.assigned_consultant_id);
  NEW.office_id := COALESCE(oid, '00000000-0000-0000-0000-000000000001'::uuid);
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stamp_office_properties ON properties;
CREATE TRIGGER stamp_office_properties BEFORE INSERT ON properties FOR EACH ROW EXECUTE FUNCTION stamp_office_id_properties();

DROP TRIGGER IF EXISTS stamp_office_clients ON clients;
CREATE TRIGGER stamp_office_clients BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION stamp_office_id_clients();

DROP TRIGGER IF EXISTS stamp_office_commissions ON commissions;
CREATE TRIGGER stamp_office_commissions BEFORE INSERT ON commissions FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

DROP TRIGGER IF EXISTS stamp_office_documents ON documents;
CREATE TRIGGER stamp_office_documents BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

DROP TRIGGER IF EXISTS stamp_office_expenses ON expenses;
CREATE TRIGGER stamp_office_expenses BEFORE INSERT ON expenses FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

DROP TRIGGER IF EXISTS stamp_office_interactions ON interactions;
CREATE TRIGGER stamp_office_interactions BEFORE INSERT ON interactions FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

DROP TRIGGER IF EXISTS stamp_office_followups ON follow_ups;
CREATE TRIGGER stamp_office_followups BEFORE INSERT ON follow_ups FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

-- RLS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_authenticated ON brands;
CREATE POLICY allow_authenticated ON brands FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_authenticated ON offices;
CREATE POLICY allow_authenticated ON offices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_authenticated ON office_memberships;
CREATE POLICY allow_authenticated ON office_memberships FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `,
  },

  {
    id: '055_sales_closing',
    sql: `
-- ─── SATIŞ KAPATMA: HQ payı + sales_closings + property sold trigger ─────────

-- document_type enum'una sales_closing ekle
DO $$ BEGIN
  ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'sales_closing';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- commissions tablosuna HQ payı alanları
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS hq_share_rate NUMERIC(5,2);    -- markaya göre % (varsayılan brand.hq_share_rate)
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS hq_share_amount NUMERIC(15,2);
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

-- ─── SALES_CLOSINGS (satış kapatma belgesi) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- bağlamlar
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  office_id UUID REFERENCES offices(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  co_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL, -- alıcı veya satıcı (genelde alıcı)
  commission_id UUID REFERENCES commissions(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  -- finansal
  service_fee NUMERIC(15,2),                  -- toplam alınan hizmet bedeli
  hq_share_rate NUMERIC(5,2),                 -- HQ %
  hq_share_amount NUMERIC(15,2),
  office_share_rate NUMERIC(5,2),             -- ofisin (HQ sonrası kalan tutardan)
  office_share_amount NUMERIC(15,2),
  consultant_share_rate NUMERIC(5,2),         -- danışmanın
  consultant_share_amount NUMERIC(15,2),
  co_consultant_share_rate NUMERIC(5,2),
  co_consultant_share_amount NUMERIC(15,2),
  -- imza akışı
  status TEXT NOT NULL DEFAULT 'pending', -- pending | filled | sent | signed | cancelled
  notes TEXT,
  filled_at TIMESTAMPTZ,
  filled_by UUID REFERENCES consultants(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ,
  pdf_url TEXT,
  signed_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN CREATE TRIGGER sales_closings_updated_at BEFORE UPDATE ON sales_closings FOR EACH ROW EXECUTE FUNCTION update_updated_at(); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_sales_closings_office     ON sales_closings(office_id);
CREATE INDEX IF NOT EXISTS idx_sales_closings_consultant ON sales_closings(consultant_id);
CREATE INDEX IF NOT EXISTS idx_sales_closings_status     ON sales_closings(status);
CREATE INDEX IF NOT EXISTS idx_sales_closings_property   ON sales_closings(property_id);

ALTER TABLE sales_closings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON sales_closings;
CREATE POLICY allow_authenticated ON sales_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- BEFORE INSERT trigger: office_id auto-stamp
DROP TRIGGER IF EXISTS stamp_office_sales_closings ON sales_closings;
CREATE TRIGGER stamp_office_sales_closings BEFORE INSERT ON sales_closings FOR EACH ROW EXECUTE FUNCTION stamp_office_id();

-- ─── AUTO-CREATE TRIGGER: property 'sold' olduğunda pending sales_closing aç ──
CREATE OR REPLACE FUNCTION create_pending_sales_closing()
RETURNS TRIGGER AS $fn$
DECLARE
  v_office_id UUID;
  v_brand_id UUID;
  v_hq_rate NUMERIC(5,2);
  v_office_default_rate NUMERIC(5,2);
  v_consultant_default_rate NUMERIC(5,2);
BEGIN
  -- Yalnızca status active/under_offer iken sold'a geçişte tetiklensin
  IF NEW.status <> 'sold' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'sold' THEN
    RETURN NEW; -- zaten sold idi, yeni belge açma
  END IF;

  -- Bu property için zaten pending bir sales_closing varsa bir daha açma
  IF EXISTS (SELECT 1 FROM sales_closings WHERE property_id = NEW.id AND status IN ('pending','filled','sent')) THEN
    RETURN NEW;
  END IF;

  -- Office/brand bilgisini topla
  v_office_id := NEW.office_id;
  IF v_office_id IS NULL AND NEW.assigned_consultant_id IS NOT NULL THEN
    v_office_id := current_office_of_consultant(NEW.assigned_consultant_id);
  END IF;

  SELECT o.brand_id, COALESCE(b.hq_share_rate, 0), o.default_office_share_rate, o.default_consultant_share_rate
    INTO v_brand_id, v_hq_rate, v_office_default_rate, v_consultant_default_rate
    FROM offices o
    LEFT JOIN brands b ON b.id = o.brand_id
   WHERE o.id = v_office_id;

  INSERT INTO sales_closings (
    property_id, office_id, brand_id, consultant_id,
    hq_share_rate, office_share_rate, consultant_share_rate,
    status, notes
  ) VALUES (
    NEW.id, v_office_id, v_brand_id, NEW.assigned_consultant_id,
    COALESCE(v_hq_rate, 0), COALESCE(v_office_default_rate, 50), COALESCE(v_consultant_default_rate, 50),
    'pending', 'Property "sold" olarak işaretlendi — kapatma bilgileri bekleniyor'
  );

  -- sold_at otomatik set et (zaten yoksa)
  IF NEW.sold_at IS NULL THEN
    NEW.sold_at := now();
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_property_sold_create_closing ON properties;
CREATE TRIGGER trg_property_sold_create_closing
  BEFORE UPDATE OF status ON properties
  FOR EACH ROW EXECUTE FUNCTION create_pending_sales_closing();
    `,
  },

  {
    id: '056_office_scoped_rls',
    sql: `
-- ─── OFFICE-SCOPED RLS: helper fonksiyonlar + politikalar ────────────────────
-- Mevcut mimari: tek-ofis kurulumlarda kimse engellenmesin (backward compat).
-- Çoklu ofis: broker yalnızca üyesi olduğu ofisi(ler)i görür.
-- Admin (role='admin') hep her şeyi görür.

CREATE OR REPLACE FUNCTION my_consultant_id()
RETURNS UUID AS $fn$
  SELECT id FROM consultants WHERE user_id = auth.uid() LIMIT 1;
$fn$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION my_role()
RETURNS user_role AS $fn$
  SELECT role FROM consultants WHERE user_id = auth.uid() LIMIT 1;
$fn$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Kullanıcının AKTİF üyesi olduğu ofislerin id listesi
CREATE OR REPLACE FUNCTION my_active_office_ids()
RETURNS SETOF UUID AS $fn$
  SELECT office_id FROM office_memberships
  WHERE consultant_id = my_consultant_id() AND end_date IS NULL;
$fn$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Kullanıcı belirli bir ofiste yetkili mi (broker/manager/admin/üye)?
CREATE OR REPLACE FUNCTION can_see_office(p_office_id UUID)
RETURNS BOOLEAN AS $fn$
  SELECT
    -- admin her şeyi görür
    (SELECT role = 'admin' FROM consultants WHERE user_id = auth.uid() LIMIT 1)
    OR
    -- ofiste şu an üye
    EXISTS (
      SELECT 1 FROM office_memberships
      WHERE consultant_id = my_consultant_id()
        AND office_id = p_office_id
        AND end_date IS NULL
    )
    OR
    -- ofiste geçmişte üyeydi (eski broker eski verileri görmeye devam etsin)
    EXISTS (
      SELECT 1 FROM office_memberships
      WHERE consultant_id = my_consultant_id()
        AND office_id = p_office_id
        AND role IN ('broker','manager')
    );
$fn$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Office-scoped politikalar (allow_authenticated yerine) ──────────────────
-- Sadece broker/manager rolü olan kullanıcıları kapsayan tablolar için
-- consultant kendi kayıtlarını her halükarda görür (consultant_id = my_consultant_id)

DO $$ BEGIN
  -- properties
  DROP POLICY IF EXISTS office_scoped_properties ON properties;
  CREATE POLICY office_scoped_properties ON properties FOR ALL TO authenticated
    USING (
      my_role() = 'admin'
      OR assigned_consultant_id = my_consultant_id()
      OR can_see_office(office_id)
    )
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  -- clients
  DROP POLICY IF EXISTS office_scoped_clients ON clients;
  CREATE POLICY office_scoped_clients ON clients FOR ALL TO authenticated
    USING (
      my_role() = 'admin'
      OR assigned_consultant_id = my_consultant_id()
      OR can_see_office(office_id)
    )
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  -- commissions
  DROP POLICY IF EXISTS office_scoped_commissions ON commissions;
  CREATE POLICY office_scoped_commissions ON commissions FOR ALL TO authenticated
    USING (
      my_role() = 'admin'
      OR consultant_id = my_consultant_id()
      OR co_consultant_id = my_consultant_id()
      OR can_see_office(office_id)
    )
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  -- sales_closings
  DROP POLICY IF EXISTS office_scoped_sales_closings ON sales_closings;
  CREATE POLICY office_scoped_sales_closings ON sales_closings FOR ALL TO authenticated
    USING (
      my_role() = 'admin'
      OR consultant_id = my_consultant_id()
      OR co_consultant_id = my_consultant_id()
      OR can_see_office(office_id)
    )
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  -- documents
  DROP POLICY IF EXISTS office_scoped_documents ON documents;
  CREATE POLICY office_scoped_documents ON documents FOR ALL TO authenticated
    USING (
      my_role() = 'admin'
      OR consultant_id = my_consultant_id()
      OR can_see_office(office_id)
    )
    WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Eski permissive policy'leri bu tablolar için kaldır ki yeni scoped policy aktif olsun
DROP POLICY IF EXISTS allow_authenticated ON properties;
DROP POLICY IF EXISTS allow_authenticated ON clients;
DROP POLICY IF EXISTS allow_authenticated ON commissions;
DROP POLICY IF EXISTS allow_authenticated ON sales_closings;
DROP POLICY IF EXISTS allow_authenticated ON documents;
    `,
  },

  {
    id: '057_muhasebe_broker_features',
    sql: `
-- ─── feature_config: finance → muhasebe rename + broker eklensin ─────────────
UPDATE feature_config
   SET feature_key = 'muhasebe',
       label = 'Muhasebe',
       description = 'Komisyon, gider ve satış kapatma',
       icon = 'Calculator',
       route = '/muhasebe'
 WHERE feature_key = 'finance';

INSERT INTO feature_config (feature_key, label, description, icon, route, sort_order, enabled_for_roles, is_enabled) VALUES
  ('muhasebe', 'Muhasebe', 'Komisyon, gider ve satış kapatma', 'Calculator', '/muhasebe', 7, '{consultant,manager,broker,admin}', true)
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO feature_config (feature_key, label, description, icon, route, sort_order, enabled_for_roles, is_enabled) VALUES
  ('broker', 'Broker Paneli', 'Ofis yönetimi (danışmanlar, transfer, marka)', 'Briefcase', '/broker', 12, '{broker,admin,manager}', true)
ON CONFLICT (feature_key) DO NOTHING;

-- documents/finance feature override'ları varsa muhasebe'ye taşı
UPDATE consultant_feature_overrides SET feature_key = 'muhasebe' WHERE feature_key = 'finance';
    `,
  },

  {
    id: '058_sales_closing_form_fields',
    sql: `
-- ─── Satış Sonrası Portföy Kapama Formu — gerçek form alanları ───────────────
-- (Coldwell Banker / REMAX gibi markaların standart formuna göre)

-- Aracılık ve ilan bilgileri
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS agency_contract_no TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS agency_contract_date DATE;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS system_listing_no TEXT;       -- CB SİSTEM İLAN NO (marka içi)
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS external_listing_no TEXT;     -- SAHİBİNDEN İLAN NO

-- Gayrimenkule ait bilgiler (snapshot — portföy silinse de belge geçerli kalsın)
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS property_kind TEXT;           -- ev_villa | apt | ofis | dukkan | bina | arazi
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS property_address TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS property_district TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS property_city TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS tapu_pafta TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS tapu_ada TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS tapu_parsel TEXT;

-- Satıcı bilgileri
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_name TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_tc TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_address TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_phone TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Alıcı bilgileri (mevcut client_id alanı = alıcı; yine de snapshot için):
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_tc TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_address TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Satış işlemine ait bilgiler (form: satıcı + alıcı ayrı ayrı hizmet bedeli alıyor)
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS transaction_date DATE;
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS sale_amount NUMERIC(15,2);    -- gerçek tapu satış tutarı
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_fee_amount NUMERIC(15,2);
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS seller_fee_rate NUMERIC(5,2);
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_fee_amount NUMERIC(15,2);
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS buyer_fee_rate NUMERIC(5,2);
-- service_fee zaten var: TOPLAM alınan hizmet bedeli (= seller_fee + buyer_fee)

-- Danışman snapshot
ALTER TABLE sales_closings ADD COLUMN IF NOT EXISTS consultant_name_snapshot TEXT;

-- Mevcut client_id alanını "buyer" semantiğine geçişte yardımcı: zaten alıcı için kullanılıyor
-- buyer_client_id'ye taşı (idempotent)
UPDATE sales_closings SET buyer_client_id = client_id WHERE buyer_client_id IS NULL AND client_id IS NOT NULL;
    `,
  },
  {
    id: '059_broker_improvements',
    sql: `
-- ─── Sabit / tekrarlayan giderler ────────────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_day INTEGER DEFAULT 1; -- ayın kaçında (1-31)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS parent_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS month_tag TEXT; -- YYYY-MM formatında (otomatik kopyalama için)

-- ─── Türk gayrimenkul franchise markalarını seed et ───────────────────────────
INSERT INTO brands (name, hq_share_rate, notes) VALUES
  ('RE/MAX',               6.00,  'RE/MAX Türkiye franchise — aylık royalty + reklam fonu'),
  ('Century 21',           6.00,  'Century 21 Türkiye franchise'),
  ('Coldwell Banker',      7.00,  'Coldwell Banker Türkiye — CB Net üzerinden listeleme'),
  ('ERA Real Estate',      6.00,  'ERA Türkiye franchise'),
  ('Keller Williams',      6.00,  'Keller Williams Türkiye — KW Command sistemi'),
  ('Engel & Völkers',      8.00,  'Engel & Völkers Türkiye — lüks segment'),
  ('Sotheby''s Realty TR', 8.00,  'Sotheby''s International Realty Türkiye lisansı'),
  ('Turyap',               5.00,  'Turyap — yerel Türk zincir marka'),
  ('Zingat Ofis',          5.00,  'Zingat kurumsal ofis ağı'),
  ('Hepsiemlak Ofis',      5.00,  'Hepsiemlak kurumsal ofis ağı'),
  ('emlakjet Ofis',        5.00,  'emlakjet kurumsal ofis programı')
ON CONFLICT (name) DO NOTHING;
    `,
  },
  {
    id: '060_office_royalty_rate',
    sql: `
ALTER TABLE offices ADD COLUMN IF NOT EXISTS royalty_rate NUMERIC(5,2) DEFAULT 0;
    `,
  },
  {
    id: '061_normalize_phone_numbers',
    sql: `
-- (ilk deneme — 062 ile düzeltildi)
SELECT 1;
    `,
  },
  {
    id: '062_normalize_phone_numbers_v2',
    sql: `
-- Sadece rakamları tut, sonra +90 formatına çevir.
-- [^0-9] tüm ayırıcıları (tire, boşluk, nokta, parantez, +, /) atar.
-- Zaten +90XXXXXXXXXX (13 karakter) formatında olan kayıtlar atlanır.
WITH digits_cte AS (
  SELECT id,
    REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS d
  FROM clients
  WHERE phone IS NOT NULL AND phone <> ''
),
normalized_cte AS (
  SELECT id,
    CASE
      WHEN d LIKE '90%' AND LENGTH(d) = 12 THEN '+' || d
      WHEN d LIKE '0%'                      THEN '+90' || SUBSTRING(d, 2)
      WHEN LENGTH(d) = 10                   THEN '+90' || d
      WHEN LENGTH(d) = 11 AND d LIKE '0%'   THEN '+90' || SUBSTRING(d, 2)
      ELSE '+90' || d
    END AS normalized
  FROM digits_cte
  WHERE d <> ''
)
UPDATE clients
SET phone = n.normalized
FROM normalized_cte n
WHERE clients.id = n.id
  AND clients.phone IS NOT NULL
  AND clients.phone <> ''
  AND clients.phone NOT SIMILAR TO '[+]90[0-9]{10}';
    `,
  },

  {
    id: '053_marketing_module',
    sql: `
-- Campaigns: çok kanallı (whatsapp + email + linkedin) hale getir
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS html_template TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS from_name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_source TEXT DEFAULT 'clients';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lead_filter JSONB;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS opened_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS clicked_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS property_id UUID;

-- Campaign logs: email/linkedin tracking
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS email_message_id TEXT;
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

-- Pazarlama lead havuzu (CRM müşterilerinden ayrı, scrape edilmiş kişiler)
CREATE TABLE IF NOT EXISTS marketing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  industry TEXT,
  city TEXT,
  district TEXT,
  linkedin_url TEXT,
  website TEXT,
  source TEXT NOT NULL,
  source_detail TEXT,
  enrichment_data JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT '{}',
  kvkk_consent BOOLEAN DEFAULT false,
  unsubscribed BOOLEAN DEFAULT false,
  unsubscribed_at TIMESTAMPTZ,
  bounced BOOLEAN DEFAULT false,
  last_contacted_at TIMESTAMPTZ,
  contact_count INTEGER DEFAULT 0,
  converted_to_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  scrape_job_id UUID,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_leads_email ON marketing_leads(LOWER(email)) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_leads_phone ON marketing_leads(phone) WHERE phone IS NOT NULL AND phone <> '';
CREATE INDEX IF NOT EXISTS idx_marketing_leads_city ON marketing_leads(city);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_source ON marketing_leads(source);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_linkedin ON marketing_leads(linkedin_url) WHERE linkedin_url IS NOT NULL;

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON marketing_leads;
CREATE POLICY allow_authenticated ON marketing_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Apify scrape işleri (Google Maps, LinkedIn vb.)
CREATE TABLE IF NOT EXISTS lead_scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  input JSONB NOT NULL,
  apify_run_id TEXT,
  apify_dataset_id TEXT,
  status TEXT DEFAULT 'pending',
  result_count INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4),
  error_message TEXT,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE lead_scrape_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_authenticated ON lead_scrape_jobs;
CREATE POLICY allow_authenticated ON lead_scrape_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- KVKK / iletişim red listesi (public unsubscribe endpoint için)
CREATE TABLE IF NOT EXISTS marketing_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  reason TEXT,
  campaign_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsub_email ON marketing_unsubscribes(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_unsub_phone ON marketing_unsubscribes(phone) WHERE phone IS NOT NULL;

ALTER TABLE marketing_unsubscribes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_insert ON marketing_unsubscribes;
CREATE POLICY allow_anon_insert ON marketing_unsubscribes FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS allow_authenticated_all ON marketing_unsubscribes;
CREATE POLICY allow_authenticated_all ON marketing_unsubscribes FOR ALL TO authenticated USING (true) WITH CHECK (true);
    `,
  },
]

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.warn('[migrate] SUPABASE_URL veya SERVICE_ROLE_KEY eksik, migration atlandı.')
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  })

  // Uygulanmış migration'ları çek (_schema_migrations yoksa boş döner)
  const { data: applied } = await supabase
    .from('_schema_migrations')
    .select('id')

  const appliedIds = new Set((applied || []).map((r: { id: string }) => r.id))

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) {
      console.log(`[migrate] ↷ ${migration.id} zaten uygulanmış.`)
      continue
    }

    console.log(`[migrate] ▶ ${migration.id} uygulanıyor...`)
    const { error } = await supabase.rpc('exec_sql', { sql: migration.sql })
    if (error) {
      console.error(`[migrate] ✗ ${migration.id}:`, error.message)
      continue
    }

    await supabase
      .from('_schema_migrations')
      .insert({ id: migration.id })

    console.log(`[migrate] ✓ ${migration.id} tamamlandı.`)
  }
}
