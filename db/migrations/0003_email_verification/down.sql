drop table auth_tokens;
alter table users drop column session_version;
alter table users drop column verified_at;
