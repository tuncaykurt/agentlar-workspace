-- Yeni komisyon oran deiiklii talepleri tablosu
CREATE TABLE commission_rate_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  membership_id uuid REFERENCES office_memberships(id) ON DELETE CASCADE,
  office_id uuid REFERENCES offices(id) ON DELETE CASCADE,
  consultant_id uuid REFERENCES consultants(id) ON DELETE CASCADE,
  requested_by_id uuid REFERENCES consultants(id) ON DELETE CASCADE,
  proposed_rate numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- RLS
ALTER TABLE commission_rate_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brokers can see requests for their office"
  ON commission_rate_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM office_memberships m
      WHERE m.office_id = commission_rate_requests.office_id
      AND m.consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
      AND m.role = 'broker'
    )
  );

CREATE POLICY "Consultants can see their own requests"
  ON commission_rate_requests
  FOR SELECT
  USING (
    consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
  );

CREATE POLICY "Brokers can insert requests"
  ON commission_rate_requests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM office_memberships m
      WHERE m.office_id = commission_rate_requests.office_id
      AND m.consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
      AND m.role = 'broker'
    )
  );

CREATE POLICY "Consultants can insert requests"
  ON commission_rate_requests
  FOR INSERT
  WITH CHECK (
    consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
  );

CREATE POLICY "Brokers can update their requests"
  ON commission_rate_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM office_memberships m
      WHERE m.office_id = commission_rate_requests.office_id
      AND m.consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
      AND m.role = 'broker'
    )
  );

CREATE POLICY "Consultants can update their requests"
  ON commission_rate_requests
  FOR UPDATE
  USING (
    consultant_id = (SELECT id FROM consultants WHERE user_id = auth.uid())
  );
