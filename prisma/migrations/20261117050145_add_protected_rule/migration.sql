-- CreateTable
CREATE TABLE "ProtectedRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProtectedRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProtectedRule_userId_idx" ON "ProtectedRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtectedRule_userId_scope_pattern_key" ON "ProtectedRule"("userId", "scope", "pattern");
