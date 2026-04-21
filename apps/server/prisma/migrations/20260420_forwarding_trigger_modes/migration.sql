ALTER TABLE "asteriskForwardingRules"
  ADD COLUMN "forwardTriggerMode" VARCHAR(32) NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN "queueWaitSeconds" INTEGER,
  ADD COLUMN "stickyCallbackWindowMinutes" INTEGER;
