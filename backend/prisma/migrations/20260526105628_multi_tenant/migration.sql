/*
  Warnings:

  - You are about to drop the `Builder` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[phone,builderId]` on the table `leads` will be added. If there are existing duplicate values, this will fail.
  - Made the column `builderId` on table `leads` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_builderId_fkey";

-- DropIndex
DROP INDEX "leads_phone_key";

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "builderId" SET NOT NULL;

-- DropTable
DROP TABLE "Builder";

-- CreateTable
CREATE TABLE "builders" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "systemPrompt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "builders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "builders_phoneNumberId_key" ON "builders"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_phone_builderId_key" ON "leads"("phone", "builderId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
