-- Last updated: 2026-06-11
-- Maintenance banner settings: three rows in the app_settings key/value store
-- (see 047_app_settings.sql).
--
--   maintenance_banner             jsonb content: message, severity,
--                                  optional startsAt/endsAt window + link
--   maintenance_banner_enabled     boolean — master visibility switch
--   maintenance_banner_dismissible boolean — visitors may close the banner
--
-- The booleans are discrete rows (same pattern as gallery_explore_enabled);
-- the API composes all three into one config object for clients. The config
-- shape is owned by lib/maintenance-banner.ts (MaintenanceBannerSchema).
-- Writes happen via service-role only, gated to super_admin in the admin route.

insert into app_settings (key, value)
values
  ('maintenance_banner', '{"message":"","severity":"info"}'::jsonb),
  ('maintenance_banner_enabled', 'false'::jsonb),
  ('maintenance_banner_dismissible', 'true'::jsonb)
on conflict (key) do nothing;
