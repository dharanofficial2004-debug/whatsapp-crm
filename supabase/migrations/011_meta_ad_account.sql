-- ============================================================
-- 011_meta_ad_account.sql — Add ad_account_id to meta_ads_config
-- ============================================================

ALTER TABLE meta_ads_config ADD COLUMN IF NOT EXISTS ad_account_id TEXT;
