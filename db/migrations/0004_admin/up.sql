-- Admins manage accounts. Accounts listed in ADMIN_EMAILS are always admins.
alter table users add column role text not null default 'member' check (role in ('member', 'admin'));
-- A disabled account can't log in, and its sessions end.
alter table users add column disabled_at integer;
-- Shown to admins on the users page.
alter table users add column last_login_at integer;
