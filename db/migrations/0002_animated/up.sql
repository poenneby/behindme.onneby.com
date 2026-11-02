-- Animated GIF backgrounds are stored as .gif with a _thumb.png, and are
-- installed into Teams as <guid>.png.
alter table backgrounds add column animated integer not null default 0 check (animated in (0, 1));
