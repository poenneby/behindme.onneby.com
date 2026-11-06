-- New uploads wait for an admin's approval. Existing backgrounds count as
-- approved. (Rolling back to the release before this would show pending
-- uploads publicly, since that code doesn't know about review status.)
alter table backgrounds add column status text not null default 'approved'
  check (status in ('pending', 'approved', 'rejected'));
alter table backgrounds add column reviewed_at integer;
alter table backgrounds add column reviewed_by text references users(id) on delete set null;
-- Shown to the uploader when a background isn't approved.
alter table backgrounds add column rejection_reason text;
create index backgrounds_status on backgrounds(status);

-- Members flag approved backgrounds that shouldn't be there. One report per
-- person per background; resolving it (dismissing) keeps the background.
create table reports (
  id text primary key not null,
  background_id text not null references backgrounds(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  reason text not null check (length(trim(reason)) > 0),
  created_at integer not null,
  resolved_at integer,
  unique (background_id, user_id)
);

create index reports_open on reports(resolved_at, background_id);
