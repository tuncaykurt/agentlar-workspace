-- =====================================================
-- Gayrimenkul Danışman Platformu — Ana Şema
-- Migration: 001_initial_schema.sql
-- =====================================================

-- ==================== ENUM TIPLERI ====================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'consultant');
CREATE TYPE client_type AS ENUM ('buyer', 'seller', 'both', 'investor', 'tenant', 'landlord');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'negotiating', 'won', 'lost', 'dormant');
CREATE TYPE property_status AS ENUM ('active', 'under_offer', 'sold', 'rented', 'withdrawn');
CREATE TYPE property_type AS ENUM ('apartment', 'villa', 'land', 'commercial', 'office', 'shop', 'warehouse', 'detached_house');
CREATE TYPE listing_source AS ENUM ('manual', 'sahibinden', 'cb_com_tr', 'hepsiemlak', 'emlakjet', 'zingat', 'referral', 'walk_in', 'other');
CREATE TYPE interaction_channel AS ENUM ('whatsapp', 'email', 'call_inbound', 'call_outbound', 'sms', 'meeting', 'note');
CREATE TYPE interaction_direction AS ENUM ('inbound', 'outbound', 'internal');
CREATE TYPE document_type AS ENUM ('authorization', 'sales_contract', 'rental_contract', 'offer_letter', 'other');
CREATE TYPE signature_status AS ENUM ('draft', 'sent', 'viewed', 'signed', 'declined', 'expired');
CREATE TYPE follow_up_status AS ENUM ('pending', 'sent', 'done', 'cancelled');
CREATE TYPE social_platform AS ENUM ('instagram', 'facebook', 'linkedin', 'twitter');
CREATE TYPE post_status AS ENUM ('draft', 'scheduled', 'posted', 'failed');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sending', 'completed', 'cancelled');
CREATE TYPE commission_status AS ENUM ('pending', 'confirmed', 'paid', 'cancelled');
CREATE TYPE expense_category AS ENUM ('marketing', 'transport', 'office', 'training', 'meal', 'gift', 'other');

-- ==================== DANIŞMANLAR ====================

CREATE TABLE consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'consultant',
  commission_rate NUMERIC(5,2) DEFAULT 0, -- Ofise gidecek komisyondan danışmanın payı (%)
  profile_photo_url TEXT,
  tax_number TEXT,
  id_number TEXT,
  address TEXT,
  bio TEXT,
  -- Belgeler (Supabase Storage URL'leri)
  authorization_doc_url TEXT,
  tax_certificate_url TEXT,
  id_front_url TEXT,
  id_back_url TEXT,
  -- Sertifikalar (JSON array)
  certifications JSONB DEFAULT '[]'::jsonb,
  -- Sosyal medya hesapları
  instagram_handle TEXT,
  facebook_page TEXT,
  linkedin_url TEXT,
  -- Durum
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== MÜŞTERİLER ====================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  client_type client_type NOT NULL DEFAULT 'buyer',
  assigned_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  lead_status lead_status NOT NULL DEFAULT 'new',
  source listing_source DEFAULT 'other',
  source_detail TEXT, -- Portal adı, kişi adı gibi detay
  -- Alıcı kriterleri (client_type = buyer)
  budget_min NUMERIC(15,2),
  budget_max NUMERIC(15,2),
  preferred_cities TEXT[],
  preferred_districts TEXT[],
  preferred_property_types property_type[],
  min_m2 INTEGER,
  max_m2 INTEGER,
  min_rooms INTEGER,
  -- Notlar
  notes TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== MÜLKİYET (PORTFÖY) ====================

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  -- Fiyat
  price NUMERIC(15,2),
  price_negotiable BOOLEAN DEFAULT false,
  currency TEXT DEFAULT 'TRY',
  -- Konum
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  address TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  -- Özellikler
  property_type property_type NOT NULL DEFAULT 'apartment',
  status property_status NOT NULL DEFAULT 'active',
  m2_gross INTEGER,
  m2_net INTEGER,
  room_count TEXT, -- "3+1", "4+2" gibi
  bathroom_count INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  age INTEGER, -- bina yaşı (yıl)
  heating_type TEXT,
  -- Özellikler (JSON)
  features JSONB DEFAULT '[]'::jsonb, -- ["havuz", "garaj", "güvenlik", ...]
  -- Medya
  photos TEXT[] DEFAULT '{}', -- Supabase Storage URL'leri
  video_url TEXT,
  -- İlan kaynağı
  source listing_source DEFAULT 'manual',
  source_url TEXT, -- scraping için kaynak URL
  source_listing_id TEXT, -- portaldaki ilan no
  -- Bağlantılar
  assigned_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  seller_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Takip
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  listed_at TIMESTAMPTZ DEFAULT now(),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== ETKİLEŞİMLER (İLETİŞİM GEÇMİŞİ) ====================

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  channel interaction_channel NOT NULL,
  direction interaction_direction NOT NULL DEFAULT 'outbound',
  content TEXT, -- mesaj içeriği veya görüşme notu
  duration_seconds INTEGER, -- çağrı süresi
  recording_url TEXT, -- ses kaydı URL
  whatsapp_message_id TEXT, -- Evolution API mesaj ID
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== TAKİP GÖREVLERİ ====================

CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  channel interaction_channel DEFAULT 'whatsapp',
  message_template TEXT,
  custom_message TEXT,
  status follow_up_status DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== KOMİSYON KAYITLARI ====================

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  -- Satış bilgisi
  sale_price NUMERIC(15,2) NOT NULL,
  -- Komisyon hesaplama
  total_commission_rate NUMERIC(5,2) NOT NULL, -- toplam komisyon oranı (%)
  total_commission_amount NUMERIC(15,2), -- hesaplanan tutar
  office_share_rate NUMERIC(5,2), -- ofisin payı (%)
  office_share_amount NUMERIC(15,2),
  consultant_share_rate NUMERIC(5,2), -- danışmanın payı (%)
  consultant_share_amount NUMERIC(15,2),
  -- Diğer danışmanlar (ortak satış durumu)
  co_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  co_consultant_share_rate NUMERIC(5,2),
  co_consultant_share_amount NUMERIC(15,2),
  -- Durum
  status commission_status DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== GİDERLER ====================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  category expense_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  receipt_url TEXT, -- fiş/fatura görseli
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES consultants(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  is_approved BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== BELGELER (SÖZLEŞMELER) ====================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type document_type NOT NULL,
  title TEXT NOT NULL,
  -- Taraflar
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  -- İçerik
  template_name TEXT,
  template_data JSONB DEFAULT '{}'::jsonb, -- şablonu doldurmak için veri
  -- Dosyalar
  pdf_url TEXT,
  signed_pdf_url TEXT,
  -- DocuSign
  docusign_envelope_id TEXT,
  docusign_status TEXT,
  signature_status signature_status DEFAULT 'draft',
  -- İzleme
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SOSYAL MEDYA İÇERİKLERİ ====================

CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  content_text TEXT,
  hashtags TEXT[],
  image_urls TEXT[],
  video_url TEXT,
  -- AI üretim bilgisi
  ai_prompt TEXT,
  sample_image_url TEXT, -- örnek görsel URL (AI için referans)
  -- Yayın
  status post_status DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT, -- Instagram/Facebook post ID
  -- Metrikler
  likes INTEGER,
  comments INTEGER,
  reach INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== WHATSAPP KAMPANYALARI ====================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
  -- Hedef kitle
  target_client_type client_type,
  target_lead_status lead_status,
  target_consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  custom_client_ids UUID[], -- özel müşteri listesi
  -- Mesaj
  message_template TEXT NOT NULL,
  media_url TEXT, -- görsel/video eklentisi
  -- Gönderim
  status campaign_status DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Sayaçlar
  target_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  -- n8n workflow ref
  n8n_execution_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Kampanya gönderim detayları (her müşteri için ayrı kayıt)
CREATE TABLE campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone TEXT,
  status TEXT DEFAULT 'pending', -- pending / sent / failed / delivered / read
  whatsapp_message_id TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== PORTFÖY-ALICI EŞLEŞMELERİ ====================

CREATE TABLE property_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  match_score INTEGER, -- 0-100 eşleşme skoru
  is_notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  client_response TEXT, -- ilgileniyor / ilgilenmiyor / görüldü
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(property_id, client_id)
);

-- ==================== SİSTEM AYARLARI ====================

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayılan ayarlar
INSERT INTO settings (key, value, description) VALUES
  ('office_commission_rate', '3.0', 'Varsayılan ofis komisyon oranı (%)'),
  ('default_follow_up_days', '7', 'Varsayılan takip aralığı (gün)'),
  ('whatsapp_welcome_template', '"Merhaba {name}, {office_name} ekibine hoş geldiniz! Size nasıl yardımcı olabiliriz?"', 'WhatsApp karşılama mesaj şablonu'),
  ('office_name', '"Gayrimenkul Ofisi"', 'Ofis adı'),
  ('office_phone', '""', 'Ofis telefonu'),
  ('office_address', '""', 'Ofis adresi');

-- ==================== İNDEKSLER ====================

CREATE INDEX idx_clients_consultant ON clients(assigned_consultant_id);
CREATE INDEX idx_clients_status ON clients(lead_status);
CREATE INDEX idx_clients_type ON clients(client_type);
CREATE INDEX idx_properties_consultant ON properties(assigned_consultant_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_interactions_client ON interactions(client_id);
CREATE INDEX idx_interactions_created ON interactions(created_at DESC);
CREATE INDEX idx_follow_ups_due ON follow_ups(due_at) WHERE status = 'pending';
CREATE INDEX idx_follow_ups_consultant ON follow_ups(consultant_id);
CREATE INDEX idx_commissions_consultant ON commissions(consultant_id);
CREATE INDEX idx_expenses_consultant ON expenses(consultant_id);
CREATE INDEX idx_documents_client ON documents(client_id);
CREATE INDEX idx_social_posts_consultant ON social_posts(consultant_id);
CREATE INDEX idx_campaigns_consultant ON campaigns(consultant_id);

-- ==================== UPDATED_AT TETİKLEYİCİSİ ====================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consultants_updated_at BEFORE UPDATE ON consultants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER follow_ups_updated_at BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER commissions_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER social_posts_updated_at BEFORE UPDATE ON social_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
