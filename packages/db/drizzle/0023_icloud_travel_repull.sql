-- Download iCloud events again on the next sync, so events pulled before Homa read Apple's travel
-- time (X-APPLE-TRAVEL-DURATION) get it. Events with a change waiting to be pushed keep their
-- ETag, so that push still matches the server's copy. The label names the CalDAV host.
UPDATE "calendars" SET "sync_token" = NULL
WHERE "connection_id" IN (SELECT "id" FROM "connections" WHERE "provider" = 'caldav' AND "label" LIKE '%icloud.com');
--> statement-breakpoint
UPDATE "events" e SET "remote_etag" = NULL
FROM "calendars" c JOIN "connections" k ON k."id" = c."connection_id"
WHERE e."calendar_id" = c."id"
  AND k."provider" = 'caldav' AND k."label" LIKE '%icloud.com'
  AND NOT EXISTS (SELECT 1 FROM "outbox" o WHERE o."calendar_id" = e."calendar_id" AND o."uid" = e."uid");
