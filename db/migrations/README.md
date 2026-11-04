# Migrations

Each numbered folder has an `up.sql` (and a `down.sql` where the change can
be undone). They run in order when the server starts. Add a new folder for
every change; never edit one that has been deployed, because the migration
runner checks each applied migration's checksum and refuses to start if one
changed.

## Only ever add

Migrations must keep working with the previous release:

- add tables and columns (new columns need a default or must allow null)
- don't drop, rename, or change the meaning of existing tables and columns

The deploy runner rolls back to the previous release when a new one fails
to start, and that previous release then runs against the database the new
one already migrated. `migrateDatabase()` in `app/db.ts` lets it start
anyway (it skips migrating when the database is ahead), so the old code has
to cope with the extra tables and columns.

To remove something, first ship code that stops using it, then drop it in a
later migration.

The one exception so far is `0005_categories`, which renamed the office
table and column while the site had no data: a rollback of that release
would have needed fixing forward rather than rolling back.
