CREATE TABLE "announcements" (
  "announcementId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "authorName" VARCHAR(50) NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("announcementId")
);

CREATE INDEX "announcements_tenantId_pinned_createdAt_idx"
  ON "announcements"("tenantId", "pinned", "createdAt" DESC);

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
