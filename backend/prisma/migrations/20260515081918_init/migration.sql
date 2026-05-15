-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'PLOT', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('GREETING', 'ASK_PROPERTY_TYPE', 'ASK_BUDGET', 'ASK_LOCATION', 'ASK_BHK', 'ASK_PURPOSE', 'ASK_TIMELINE', 'ASK_NAME', 'ASK_SITE_VISIT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'BOT');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('INVESTMENT', 'END_USE');

-- CreateEnum
CREATE TYPE "Timeline" AS ENUM ('ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'MORE_THAN_SIX_MONTHS');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "propertyType" "PropertyType",
    "budget" TEXT,
    "location" TEXT,
    "bhk" TEXT,
    "purpose" "Purpose",
    "timeline" "Timeline",
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'GREETING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_phone_key" ON "leads"("phone");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
