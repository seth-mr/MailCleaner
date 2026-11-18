-- CreateTable
CREATE TABLE "AutoCleanRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "gmailFilterId" TEXT,
    "lastRunAt" DATETIME,
    "lastRunCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoCleanRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AutoCleanRule_userId_idx" ON "AutoCleanRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoCleanRule_userId_type_pattern_key" ON "AutoCleanRule"("userId", "type", "pattern");
