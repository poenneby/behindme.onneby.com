drop table reports;
drop index backgrounds_status;
alter table backgrounds drop column rejection_reason;
alter table backgrounds drop column reviewed_by;
alter table backgrounds drop column reviewed_at;
alter table backgrounds drop column status;
