-- Add Research Tool settings to Chatbot Config
ALTER TABLE whatsapp_chatbot_config 
ADD COLUMN IF NOT EXISTS research_tool_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS research_delay_minutes INTEGER DEFAULT 7;
