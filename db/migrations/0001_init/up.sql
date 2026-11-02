create table users (
  id text primary key not null,
  email text not null unique,
  name text not null check (length(trim(name)) > 0),
  password_hash text not null,
  created_at integer not null
);

create table locations (
  id text primary key not null,
  slug text not null unique,
  name text not null check (length(trim(name)) > 0),
  created_at integer not null
);

create table backgrounds (
  id text primary key not null,
  user_id text not null references users(id) on delete cascade,
  location_id text not null references locations(id),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  -- File name Teams sees in its Uploads folder. Fixed per background so
  -- re-running an install script overwrites instead of duplicating.
  teams_guid text not null unique,
  downloads integer not null default 0,
  created_at integer not null
);

create index backgrounds_location on backgrounds(location_id);
create index backgrounds_created on backgrounds(created_at);

create table ratings (
  background_id text not null references backgrounds(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  created_at integer not null,
  primary key (background_id, user_id)
);
