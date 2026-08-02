-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Backfill username from email local-part (or id fallback)
UPDATE "User"
SET "username" = COALESCE(
  NULLIF(split_part("email", '@', 1), ''),
  "id"
)
WHERE "username" IS NULL OR "username" = '';

-- Ensure uniqueness for any duplicates by appending short id suffix
UPDATE "User" u
SET "username" = u."username" || '_' || LEFT(u."id", 6)
WHERE u."id" IN (
  SELECT a."id"
  FROM "User" a
  INNER JOIN "User" b ON a."username" = b."username" AND a."id" > b."id"
);

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

-- Make email optional
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
