-- CreateTable
CREATE TABLE "CachedMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "fromHeader" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "dateIso" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "hasUnsubscribeHeader" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CachedMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CachedMessage_userId_idx" ON "CachedMessage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedMessage_userId_gmailMessageId_key" ON "CachedMessage"("userId", "gmailMessageId");
