-- =====================================================
-- Row Level Security (RLS) Politikaları
-- Migration: 002_rls_policies.sql
--
-- Kurallar:
-- - admin: tüm kayıtları görür ve düzenler
-- - manager: tüm kayıtları görür, sadece kendi danışmanlarını yönetir
-- - consultant: yalnızca kendi kayıtlarını görür ve düzenler
-- =====================================================

-- RLS Etkinleştir
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

-- Yardımcı fonksiyon: mevcut kullanıcının danışman kaydını getir
CREATE OR REPLACE FUNCTION get_my_consultant_id()
RETURNS UUID AS $$
  SELECT id FROM consultants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Yardımcı fonksiyon: mevcut kullanıcının rolü
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role AS $$
  SELECT role FROM consultants WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ==================== DANIŞMANLAR ====================

-- Admin/manager tümünü görür; consultant yalnızca kendini
CREATE POLICY "consultants_select" ON consultants FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR user_id = auth.uid()
  );

-- Yalnızca admin yeni danışman ekler
CREATE POLICY "consultants_insert" ON consultants FOR INSERT
  WITH CHECK (get_my_role() = 'admin');

-- Admin tümünü; consultant yalnızca kendini günceller
CREATE POLICY "consultants_update" ON consultants FOR UPDATE
  USING (
    get_my_role() = 'admin'
    OR user_id = auth.uid()
  );

-- Yalnızca admin siler
CREATE POLICY "consultants_delete" ON consultants FOR DELETE
  USING (get_my_role() = 'admin');

-- ==================== MÜŞTERİLER ====================

CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "clients_insert" ON clients FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "clients_delete" ON clients FOR DELETE
  USING (get_my_role() IN ('admin', 'manager'));

-- ==================== PORTFÖY ====================

CREATE POLICY "properties_select" ON properties FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "properties_insert" ON properties FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "properties_update" ON properties FOR UPDATE
  USING (
    get_my_role() IN ('admin', 'manager')
    OR assigned_consultant_id = get_my_consultant_id()
  );

CREATE POLICY "properties_delete" ON properties FOR DELETE
  USING (get_my_role() IN ('admin', 'manager'));

-- ==================== ETKİLEŞİMLER ====================

CREATE POLICY "interactions_select" ON interactions FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "interactions_insert" ON interactions FOR INSERT
  WITH CHECK (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

-- ==================== TAKİP GÖREVLERİ ====================

CREATE POLICY "follow_ups_select" ON follow_ups FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "follow_ups_all" ON follow_ups FOR ALL
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

-- ==================== KOMİSYONLAR ====================

CREATE POLICY "commissions_select" ON commissions FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "commissions_admin" ON commissions FOR ALL
  USING (get_my_role() IN ('admin', 'manager'));

-- ==================== GİDERLER ====================

CREATE POLICY "expenses_select" ON expenses FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "expenses_insert" ON expenses FOR INSERT
  WITH CHECK (consultant_id = get_my_consultant_id() OR get_my_role() IN ('admin', 'manager'));

CREATE POLICY "expenses_update" ON expenses FOR UPDATE
  USING (
    get_my_role() IN ('admin', 'manager')
    OR (consultant_id = get_my_consultant_id() AND is_approved IS NULL)
  );

-- ==================== BELGELER ====================

CREATE POLICY "documents_select" ON documents FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "documents_all" ON documents FOR ALL
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

-- ==================== SOSYAL MEDYA ====================

CREATE POLICY "social_posts_select" ON social_posts FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "social_posts_all" ON social_posts FOR ALL
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

-- ==================== KAMPANYALAR ====================

CREATE POLICY "campaigns_select" ON campaigns FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "campaigns_all" ON campaigns FOR ALL
  USING (
    get_my_role() IN ('admin', 'manager')
    OR consultant_id = get_my_consultant_id()
  );

CREATE POLICY "campaign_logs_select" ON campaign_logs FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
      AND c.consultant_id = get_my_consultant_id()
    )
  );

-- ==================== EŞLEŞMELERi ====================

CREATE POLICY "property_matches_select" ON property_matches FOR SELECT
  USING (
    get_my_role() IN ('admin', 'manager')
    OR EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.assigned_consultant_id = get_my_consultant_id())
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.assigned_consultant_id = get_my_consultant_id())
  );

-- ==================== SETTINGS ====================

-- Settings herkese açık (read) ama sadece admin güncelleyebilir
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_update" ON settings FOR ALL USING (get_my_role() = 'admin');
