drop index backgrounds_category;
create index backgrounds_location on backgrounds(category_id);
alter table backgrounds rename column category_id to location_id;
alter table categories rename to locations;
