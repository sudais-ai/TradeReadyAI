-- Add passwordChangedAt column to User.
-- Used by Phase 8 to invalidate JWT sessions after a password change.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;

-- Backfill existing rows so they aren't treated as "password rotated
-- since the user's last sign-in". The earliest moment a user's password
-- could have been changed before this migration is their createdAt.
UPDATE "User" SET "passwordChangedAt" = "createdAt" WHERE "passwordChangedAt" IS NULL;
