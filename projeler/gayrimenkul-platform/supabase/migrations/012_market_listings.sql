-- =====================================================
-- Migration: 012_market_listings.sql
-- Piyasa ilan havuzu (Sahibinden lead aday tablosu)
-- Bu tablo portföy DEĞİL, iletişime geçilecek mülk sahibi adaylarıdır
-- =====================================================

CREATE TABLE IF NOT EXISTS market_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- İlan Bilgileri (Sahibinden'den otomatik çekilir)
  title TEXT,
  description TEXT,
  price NUMERIC(15,2),
  currency TEXT DEFAULT 'TRY',
  property_type TEXT, -- apartment, villa, land, commercial...
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  address TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  m2_gross INTEGER,
  m2_net INTEGER,
  room_count TEXT,      -- "3+1", "4+2"
  bathroom_count INTEGER,
  floor INTEGER,
  total_floors INTEGER,
  age INTEGER,
  heating_type TEXT,
  features JSONB DEFAULT '[]'::jsonb,
  photos TEXT[] DEFAULT '{}',

  -- Kaynak
  source TEXT DEFAULT 'sahibinden',
  source_listing_id TEXT,    -- sahibinden ilan ID'si
  source_url TEXT,           -- ilan linki
  office_source_url TEXT,    -- hangi arama URL'sinden geldi

  -- Satıcı / Mülk Sahibi Bilgileri
  seller_name TEXT,
  seller_phone TEXT,
  seller_type TEXT DEFAULT 'unknown', -- 'owner' | 'agency' | 'unknown'

  -- CRM / İletişim Durumu
  contact_status TEXT DEFAULT 'new',
  -- new        → Yeni, henüz iletişime geçilmedi
  -- contacted  → Arandı / mesaj gönderildi
  -- interested → Yetki vermek istiyor
  -- not_interested → İlgilenmiyor
  -- converted  → Portföye alındı (client + property oluşturuldu)
  -- stale      → Sahibinden'den kalktı, pasif

  contacted_at TIMESTAMPTZ,
  contacted_by_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  contact_notes TEXT,

  -- Dönüşüm Takibi (converted olduğunda doldurulur)
  converted_to_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  converted_to_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,

  -- Sistem
  last_seen_at TIMESTAMPTZ DEFAULT now(),  -- son Apify taramasında görüldü
  is_active BOOLEAN DEFAULT true,          -- Sahibinden'de hâlâ aktif mi
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(source, source_listing_id)
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(contact_status);
CREATE INDEX IF NOT EXISTS idx_market_listings_city ON market_listings(city);
CREATE INDEX IF NOT EXISTS idx_market_listings_source ON market_listings(source, source_listing_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_active ON market_listings(is_active, contact_status);
CREATE INDEX IF NOT EXISTS idx_market_listings_created ON market_listings(created_at DESC);

-- RLS (portföy tablosundaki gibi)
ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

-- Giriş yapmış danışmanlar görebilir
CREATE POLICY "market_listings_select" ON market_listings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Giriş yapmış danışmanlar ekleyip güncelleyebilir
CREATE POLICY "market_listings_insert" ON market_listings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "market_listings_update" ON market_listings
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Updated_at trigger
CREATE TRIGGER market_listings_updated_at
  BEFORE UPDATE ON market_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
