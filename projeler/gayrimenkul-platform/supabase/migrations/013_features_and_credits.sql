-- =====================================================
-- Migration: 013_features_and_credits.sql
-- Özellik yönetimi (feature flags) ve kredi sistemi
-- =====================================================

-- ─── 1. Feature Flags ────────────────────────────────────────────────────────

-- Tüm özellikler ve hangi roller görebilir
CREATE TABLE IF NOT EXISTS feature_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,     -- 'dashboard', 'crm', 'portfolio', 'documents', ...
  label TEXT NOT NULL,                  -- 'CRM', 'Portföy', ...
  description TEXT,
  icon TEXT,                            -- lucide icon adı (sidebar ile uyumlu)
  route TEXT,                           -- '/crm', '/portfolio', ...
  sort_order INTEGER DEFAULT 0,
  -- Hangi roller bu özelliği görebilir (admin her zaman görür)
  enabled_for_roles TEXT[] DEFAULT '{consultant,manager}',
  -- Global açma/kapama (admin hariç herkesi etkiler)
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Danışman bazlı override (opsiyonel - belirli bir danışmana özel açma/kapama)
CREATE TABLE IF NOT EXISTS consultant_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES feature_config(feature_key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL,  -- true = zorla aç, false = zorla kapat
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(consultant_id, feature_key)
);

-- Varsayılan özellikler
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

-- ─── 2. Kredi Sistemi ───────────────────────────────────────────────────────

-- Danışmanlara kredi bakiyesi ekle
ALTER TABLE consultants ADD COLUMN IF NOT EXISTS credit_balance INTEGER DEFAULT 0;

-- Kredi hareketleri (loglama)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,                -- pozitif = yükleme, negatif = kullanım
  balance_after INTEGER NOT NULL,         -- işlem sonrası bakiye
  transaction_type TEXT NOT NULL,         -- 'initial_grant', 'admin_grant', 'document_usage', 'admin_deduct', 'purchase'
  description TEXT,                        -- 'Belge oluşturma: Yetki Belgesi #123'
  reference_id TEXT,                       -- belge id gibi referans
  created_by UUID REFERENCES consultants(id) ON DELETE SET NULL,  -- admin ise admin id
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_consultant ON credit_transactions(consultant_id, created_at DESC);

-- Kredi ayarları (settings tablosuna)
INSERT INTO settings (key, value, description, updated_at) VALUES
  ('initial_free_credits', '5', 'Yeni danışmana verilen ücretsiz kredi sayısı', now()),
  ('credit_cost_per_document', '1', 'Belge başına kredi maliyeti', now())
ON CONFLICT (key) DO NOTHING;

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE feature_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- feature_config: herkes okuyabilir
CREATE POLICY "feature_config_select" ON feature_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- feature_config: sadece admin yazabilir (RLS + uygulama seviyesinde kontrol)
CREATE POLICY "feature_config_admin_all" ON feature_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role = 'admin')
  );

-- consultant_feature_overrides: herkes okuyabilir, admin yazabilir
CREATE POLICY "cfo_select" ON consultant_feature_overrides
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "cfo_admin_all" ON consultant_feature_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role = 'admin')
  );

-- credit_transactions: kendi kayıtlarını görebilir, admin hepsini
CREATE POLICY "credit_tx_select" ON credit_transactions
  FOR SELECT USING (
    consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM consultants WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "credit_tx_insert" ON credit_transactions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Trigger: updated_at for feature_config
CREATE TRIGGER feature_config_updated_at
  BEFORE UPDATE ON feature_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
