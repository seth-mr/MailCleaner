-- CreateTable
CREATE TABLE "CleanLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "bytesFreed" REAL NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CleanLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CleanLog_userId_createdAt_idx" ON "CleanLog"("userId", "createdAt");
