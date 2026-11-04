-- Accounts must be activated from an emailed link before they can log in.
alter table users add column verified_at integer;
-- Accounts created before activation was required count as activated.
update users set verified_at = created_at;

-- Bumped on password reset. Sessions remember the version they were made
-- with, so a reset logs out every other device.
alter table users add column session_version integer not null default 0;

-- One-time links for activation and password reset. Only a SHA-256 hash of
-- each token is stored, so a copy of the database can't be used to log in.
create table auth_tokens (
  id text primary key not null,
  user_id text not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  expires_at integer not null,
  used_at integer,
  created_at integer not null
);

create index auth_tokens_user on auth_tokens(user_id, purpose, created_at);
