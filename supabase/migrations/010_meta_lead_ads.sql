-- ============================================================
-- 010_meta_lead_ads.sql — Meta Lead Ad Form integration
--
-- Idempotent migration — safe to run multiple times.
-- Follows the same conventions as 001_initial_schema.sql:
--   IF NOT EXISTS on tables/indexes, DROP IF EXISTS before
--   re-creating policies/triggers (Postgres has no
--   CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- META_ADS_CONFIG
--
-- Per-user Meta Ads credentials, completely separate from
-- whatsapp_config. Stores the Meta App ID, encrypted App Secret,
-- Facebook Page ID, and encrypted Page Access Token needed to
-- receive leadgen webhooks and retrieve lead data via Graph API.
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_ads_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_app_id TEXT NOT NULL,
  meta_app_secret TEXT NOT NULL,        -- encrypted at rest
  page_id TEXT NOT NULL,
  page_access_token TEXT NOT NULL,      -- encrypted at rest
  verify_token TEXT,                    -- encrypted, for webhook subscribe handshake
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_config_user_id ON meta_ads_config(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_config_page_id ON meta_ads_config(page_id);

ALTER TABLE meta_ads_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own meta ads config" ON meta_ads_config;
CREATE POLICY "Users can manage own meta ads config" ON meta_ads_config FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON meta_ads_config;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meta_ads_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- META_LEAD_FORM_CONFIGS
--
-- Per-form configuration: which tag to auto-apply, which
-- WhatsApp template to auto-send when a lead arrives from a
-- specific form. A row with form_id = '' acts as the default
-- catch-all for forms without a specific config.
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_lead_form_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL DEFAULT '',
  form_name TEXT,
  auto_tag_name TEXT,
  template_name TEXT,
  template_language TEXT NOT NULL DEFAULT 'en_US',
  template_variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, form_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_form_configs_user
  ON meta_lead_form_configs(user_id);

ALTER TABLE meta_lead_form_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own lead form configs" ON meta_lead_form_configs;
CREATE POLICY "Users can manage own lead form configs" ON meta_lead_form_configs FOR ALL
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_updated_at ON meta_lead_form_configs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meta_lead_form_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- META_LEAD_EVENTS
--
-- Audit log for every lead form submission received via webhook.
-- Used for debugging, the events table in the UI, and dedup
-- (leadgen_id is unique). contact_id nullable so the event
-- survives contact deletion (same pattern as automation_logs).
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_lead_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leadgen_id TEXT NOT NULL,
  form_id TEXT,
  form_name TEXT,
  campaign_name TEXT,
  ad_id TEXT,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  lead_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  template_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(leadgen_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_events_user
  ON meta_lead_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_lead_events_leadgen
  ON meta_lead_events(leadgen_id);

ALTER TABLE meta_lead_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own lead events" ON meta_lead_events;
CREATE POLICY "Users can view own lead events" ON meta_lead_events FOR SELECT
  USING (auth.uid() = user_id);
-- Service-role inserts only — the webhook uses SUPABASE_SERVICE_ROLE_KEY.
-- No INSERT/UPDATE/DELETE policy for authenticated users.
