-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "serviceDurationMin" INTEGER;

-- Backfill from catalog for existing appointments (historical snapshot = duration at migration time)
UPDATE "Appointment" AS a
SET "serviceDurationMin" = s.duration
FROM "Service" AS s
WHERE a."serviceId" = s.id
  AND a."serviceDurationMin" IS NULL;
