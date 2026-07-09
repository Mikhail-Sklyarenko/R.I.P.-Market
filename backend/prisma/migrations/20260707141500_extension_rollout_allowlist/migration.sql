-- Extension rollout seller allowlist (M10 staged rollout)
CREATE TABLE "ExtensionRolloutAllowlistEntry" (
    "steamId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionRolloutAllowlistEntry_pkey" PRIMARY KEY ("steamId")
);
