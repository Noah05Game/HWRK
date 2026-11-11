alter table public.site_settings
  add column announcement_enabled boolean not null default false,
  add column announcement_title text not null default '',
  add column announcement_body text not null default '',
  add column announcement_background_color text not null default '#1d4ed8'
    check (announcement_background_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column announcement_text_color text not null default '#ffffff'
    check (announcement_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint site_settings_announcement_title_length
    check (char_length(announcement_title) <= 120),
  add constraint site_settings_announcement_body_length
    check (char_length(announcement_body) <= 2000);

grant select (
  announcement_enabled, announcement_title, announcement_body,
  announcement_background_color, announcement_text_color
) on public.site_settings to anon, authenticated;
grant update (
  announcement_enabled, announcement_title, announcement_body,
  announcement_background_color, announcement_text_color
) on public.site_settings to authenticated;
