-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "servicePriceSnapshot" DOUBLE PRECISION;

-- Backfill: COALESCE(location override, base catalog) — matches effectiveServicePrice()
UPDATE "Appointment" AS a
SET "servicePriceSnapshot" = (
  SELECT COALESCE(sl.price, s.price)
  FROM "Service" s
  LEFT JOIN "ServiceLocation" sl
    ON sl."serviceId" = s.id
    AND sl."businessId" = a."businessId"
    AND sl.active = true
  WHERE s.id = a."serviceId"
  LIMIT 1
)
WHERE a."serviceId" IS NOT NULL
  AND a."servicePriceSnapshot" IS NULL;
