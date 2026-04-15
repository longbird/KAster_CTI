-- AddColumn: agents.sip_password
ALTER TABLE "agents" ADD COLUMN "sip_password" TEXT;

-- CreateTable: AsteriskTrunk
CREATE TABLE "AsteriskTrunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5060,
    "username" VARCHAR(128) NOT NULL,
    "password" TEXT NOT NULL,
    "fromDomain" VARCHAR(255) NOT NULL,
    "codecs" VARCHAR(64) NOT NULL DEFAULT 'alaw,ulaw',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AsteriskTrunk_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsteriskTrunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: AsteriskIvrMenu
CREATE TABLE "AsteriskIvrMenu" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "welcomePrompt" VARCHAR(128),
    "menuPrompt" VARCHAR(128),
    "timeoutSecs" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AsteriskIvrMenu_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsteriskIvrMenu_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: AsteriskIvrEntry
CREATE TABLE "AsteriskIvrEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "digit" VARCHAR(2) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "queueName" VARCHAR(64) NOT NULL,

    CONSTRAINT "AsteriskIvrEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsteriskIvrEntry_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "AsteriskIvrMenu" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: AsteriskDid
CREATE TABLE "AsteriskDid" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "did" VARCHAR(32) NOT NULL,
    "description" VARCHAR(255),
    "ivrMenuId" UUID,
    "directQueue" VARCHAR(64),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AsteriskDid_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsteriskDid_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants" ("tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AsteriskDid_ivrMenuId_fkey" FOREIGN KEY ("ivrMenuId") REFERENCES "AsteriskIvrMenu" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex: AsteriskTrunk
CREATE UNIQUE INDEX "AsteriskTrunk_tenantId_name_key" ON "AsteriskTrunk"("tenantId", "name");

-- CreateIndex: AsteriskIvrMenu
CREATE UNIQUE INDEX "AsteriskIvrMenu_tenantId_name_key" ON "AsteriskIvrMenu"("tenantId", "name");

-- CreateIndex: AsteriskIvrEntry
CREATE UNIQUE INDEX "AsteriskIvrEntry_menuId_digit_key" ON "AsteriskIvrEntry"("menuId", "digit");

-- CreateIndex: AsteriskDid
CREATE UNIQUE INDEX "AsteriskDid_tenantId_did_key" ON "AsteriskDid"("tenantId", "did");

-- XOR constraint: AsteriskDid must have either ivrMenuId OR directQueue, not both, not neither
ALTER TABLE "AsteriskDid" ADD CONSTRAINT "asterisk_did_xor_check"
  CHECK (("ivrMenuId" IS NULL) != ("directQueue" IS NULL));
