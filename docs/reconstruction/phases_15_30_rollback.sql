-- =====================================================================
-- ROLLBACK das Fases 15 a 30 (idempotente, ordem inversa)
-- =====================================================================
begin;

-- Fase 30
drop table if exists public.slo_definitions cascade;
drop table if exists public.metrics_samples cascade;
drop table if exists public.error_events cascade;
drop table if exists public.releases cascade;

-- Fase 29
drop table if exists public.health_checks cascade;
drop table if exists public.restore_drills cascade;
drop table if exists public.backup_runs cascade;

-- Fase 28
drop table if exists public.data_retention_policies cascade;
drop table if exists public.dsr_requests cascade;
drop table if exists public.privacy_consents cascade;

-- Fase 27
drop table if exists public.support_messages cascade;
drop table if exists public.support_tickets cascade;

-- Fase 26
drop function if exists public.loyalty_apply(uuid,text,numeric,uuid,text);
drop table if exists public.loyalty_transactions cascade;
drop table if exists public.loyalty_accounts cascade;
drop table if exists public.loyalty_programs cascade;

-- Fase 25
drop table if exists public.affiliate_commissions cascade;
drop table if exists public.affiliate_referrals cascade;
drop table if exists public.affiliates cascade;

-- Fase 24
drop table if exists public.nps_surveys cascade;
drop table if exists public.reviews cascade;

-- Fase 23
drop view if exists public.v_bookings_daily;
drop table if exists public.kpi_snapshots cascade;
drop table if exists public.analytics_events cascade;

-- Fase 22
drop table if exists public.blog_posts cascade;
drop table if exists public.landing_pages cascade;
drop table if exists public.leads cascade;

-- Fase 21
drop table if exists public.currencies cascade;
drop table if exists public.translations cascade;
drop table if exists public.locales cascade;

-- Fase 20
drop table if exists public.mobile_app_versions cascade;
drop table if exists public.mobile_devices cascade;

-- Fase 19
drop table if exists public.pwa_devices cascade;
drop table if exists public.offline_mutations cascade;

-- Fase 18
drop table if exists public.calendar_sync_map cascade;
drop table if exists public.integration_tokens cascade;
drop table if exists public.integrations cascade;

-- Fase 17
drop function if exists public.feature_enabled(uuid,text);
drop table if exists public.company_settings cascade;
drop table if exists public.company_feature_flags cascade;
drop table if exists public.feature_flags cascade;

-- Fase 16
drop function if exists public.onboarding_advance(uuid,text,jsonb);
drop table if exists public.onboarding_steps cascade;
drop table if exists public.onboarding_flows cascade;

-- Fase 15
drop function if exists public.billing_apply_plan_change(uuid);
drop table if exists public.billing_payment_methods cascade;
drop table if exists public.billing_plan_change_requests cascade;
drop table if exists public.billing_portal_sessions cascade;

commit;
