-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "passStatus" TEXT NOT NULL DEFAULT 'TRIAL',
    "passExpiresAt" DATETIME,
    "reclaimedBytes" REAL NOT NULL DEFAULT 0,
    "cleanedMessagesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("cleanedMessagesCount", "createdAt", "email", "emailVerified", "id", "image", "name", "passExpiresAt", "passStatus", "reclaimedBytes", "updatedAt") SELECT "cleanedMessagesCount", "createdAt", "email", "emailVerified", "id", "image", "name", "passExpiresAt", "passStatus", "reclaimedBytes", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

