ALTER TABLE "customers" ADD COLUMN "lastCalledAt" TIMESTAMPTZ(6);
ALTER TABLE "customers" ALTER COLUMN "grade" SET DEFAULT 'NORMAL';

CREATE UNIQUE INDEX "customerPhones_customerId_normalizedPhone_key"
  ON "customerPhones" ("customerId", "normalizedPhone");
