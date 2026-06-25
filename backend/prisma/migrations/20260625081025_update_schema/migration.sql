/*
  Warnings:

  - The values [ESCALATED] on the enum `ConversationState` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `languageCode` on the `conversations` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[langGraphThreadId]` on the table `conversations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `langGraphThreadId` to the `conversations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ConversationState_new" AS ENUM ('ACTIVE', 'COMPLETED', 'HUMAN_HANDOFF', 'OPTED_OUT');
ALTER TABLE "public"."conversations" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "conversations" ALTER COLUMN "state" TYPE "ConversationState_new" USING ("state"::text::"ConversationState_new");
ALTER TYPE "ConversationState" RENAME TO "ConversationState_old";
ALTER TYPE "ConversationState_new" RENAME TO "ConversationState";
DROP TYPE "public"."ConversationState_old";
ALTER TABLE "conversations" ALTER COLUMN "state" SET DEFAULT 'ACTIVE';
COMMIT;

-- DropIndex
DROP INDEX "properties_embedding_idx1";

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "languageCode",
ADD COLUMN     "langGraphThreadId" TEXT NOT NULL,
ADD COLUMN     "languagePref" TEXT NOT NULL DEFAULT 'en';

-- CreateIndex
CREATE UNIQUE INDEX "conversations_langGraphThreadId_key" ON "conversations"("langGraphThreadId");
