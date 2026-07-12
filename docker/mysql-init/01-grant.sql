-- Prisma Migrate needs to create/drop a temporary shadow database to compute
-- migration diffs, which requires broader-than-single-schema privileges.
GRANT ALL PRIVILEGES ON *.* TO 'assetflow'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
