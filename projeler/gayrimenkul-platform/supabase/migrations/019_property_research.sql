-- Property Research Table
CREATE TABLE IF NOT EXISTS property_researches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    city TEXT,
    district TEXT,
    neighborhood TEXT,
    ada TEXT,
    parsel TEXT,
    status TEXT DEFAULT 'pending', -- pending, researching, completed, failed
    report_content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for processing queue
CREATE INDEX IF NOT EXISTS idx_property_researches_status ON property_researches(status);

-- WhatsApp Outbound Queue (for scheduled messages like the 5-10 min delay)
CREATE TABLE IF NOT EXISTS whatsapp_outbound_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultant_id UUID REFERENCES consultants(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, sent, failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_queue_scheduled_at ON whatsapp_outbound_queue(scheduled_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE property_researches ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_outbound_queue ENABLE ROW LEVEL SECURITY;

-- Simple policies for service role
CREATE POLICY "Service role full access on researches" ON property_researches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on outbound queue" ON whatsapp_outbound_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
