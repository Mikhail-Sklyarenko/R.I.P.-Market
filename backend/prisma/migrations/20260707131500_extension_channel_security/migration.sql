CREATE TYPE "ExtensionDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "ExtensionSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "ExtensionDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "status" "ExtensionDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tokenJti" TEXT NOT NULL,
    "status" "ExtensionSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "rotatedFromSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExtensionSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionNonce" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionNonce_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtensionCommandAck" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtensionCommandAck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExtensionDevice_userId_deviceId_key" ON "ExtensionDevice"("userId", "deviceId");
CREATE INDEX "ExtensionDevice_userId_status_idx" ON "ExtensionDevice"("userId", "status");
CREATE UNIQUE INDEX "ExtensionSession_tokenJti_key" ON "ExtensionSession"("tokenJti");
CREATE INDEX "ExtensionSession_userId_status_expiresAt_idx" ON "ExtensionSession"("userId", "status", "expiresAt");
CREATE INDEX "ExtensionSession_deviceId_status_idx" ON "ExtensionSession"("deviceId", "status");
CREATE UNIQUE INDEX "ExtensionNonce_sessionId_nonce_key" ON "ExtensionNonce"("sessionId", "nonce");
CREATE INDEX "ExtensionNonce_expiresAt_idx" ON "ExtensionNonce"("expiresAt");
CREATE UNIQUE INDEX "ExtensionCommandAck_sessionId_commandId_key" ON "ExtensionCommandAck"("sessionId", "commandId");
CREATE INDEX "ExtensionCommandAck_sessionId_createdAt_idx" ON "ExtensionCommandAck"("sessionId", "createdAt");

ALTER TABLE "ExtensionDevice"
ADD CONSTRAINT "ExtensionDevice_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtensionSession"
ADD CONSTRAINT "ExtensionSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtensionSession"
ADD CONSTRAINT "ExtensionSession_userId_deviceId_fkey"
FOREIGN KEY ("userId", "deviceId") REFERENCES "ExtensionDevice"("userId", "deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtensionNonce"
ADD CONSTRAINT "ExtensionNonce_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ExtensionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExtensionCommandAck"
ADD CONSTRAINT "ExtensionCommandAck_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ExtensionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
