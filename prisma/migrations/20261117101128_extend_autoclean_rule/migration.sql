-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AutoCleanRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'trash',
    "schedule" TEXT NOT NULL DEFAULT 'manual',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" DATETIME,
    "gmailFilterId" TEXT,
    "lastRunAt" DATETIME,
    "lastRunCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastRunError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoCleanRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AutoCleanRule" ("createdAt", "gmailFilterId", "id", "label", "lastRunAt", "lastRunCount", "pattern", "type", "userId") SELECT "createdAt", "gmailFilterId", "id", "label", "lastRunAt", "lastRunCount", "pattern", "type", "userId" FROM "AutoCleanRule";
DROP TABLE "AutoCleanRule";
ALTER TABLE "new_AutoCleanRule" RENAME TO "AutoCleanRule";
CREATE INDEX "AutoCleanRule_userId_idx" ON "AutoCleanRule"("userId");
CREATE INDEX "AutoCleanRule_isEnabled_schedule_nextRunAt_idx" ON "AutoCleanRule"("isEnabled", "schedule", "nextRunAt");
CREATE UNIQUE INDEX "AutoCleanRule_userId_type_pattern_key" ON "AutoCleanRule"("userId", "type", "pattern");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
