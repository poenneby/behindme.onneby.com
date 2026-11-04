-- Backgrounds are grouped by category now, not office. SQLite updates the
-- foreign key in backgrounds to follow the renamed table.
--
-- This is the one migration that renames rather than adds, so the release
-- before it can't run against the result: a rollback of this release
-- would need fixing forward. Done while there was no data to speak of.
alter table locations rename to categories;
alter table backgrounds rename column location_id to category_id;
drop index backgrounds_location;
create index backgrounds_category on backgrounds(category_id);
