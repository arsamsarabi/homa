-- Email confirmation arrives with this release. Accounts made before it count as confirmed, so
-- nobody is locked out when an instance with email set up starts requiring it.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
