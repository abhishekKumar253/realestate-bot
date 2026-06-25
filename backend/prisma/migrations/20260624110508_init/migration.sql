CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'PLOT', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('ACTIVE', 'COMPLETED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'BOT');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('INVESTMENT', 'END_USE');

-- CreateEnum
CREATE TYPE "Timeline" AS ENUM ('ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'MORE_THAN_SIX_MONTHS');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PRE_LAUNCH', 'LAUNCHED', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OptInStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('MARKETING', 'UTILITY', 'SERVICE');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateTable
CREATE TABLE "builders" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "notificationPhone" TEXT,
    "systemPrompt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "builders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "propertyType" "PropertyType",
    "location" TEXT,
    "bhk" TEXT,
    "purpose" "Purpose",
    "timeline" "Timeline",
    "amenities" TEXT,
    "possession" TEXT,
    "loanStatus" TEXT,
    "siteVisitDay" TEXT,
    "siteVisitTime" TEXT,
    "otherPropertyTypes" TEXT,
    "minBudget" INTEGER,
    "maxBudget" INTEGER,
    "score" INTEGER DEFAULT 0,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "builderId" TEXT NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'ACTIVE',
    "languageCode" TEXT DEFAULT 'en',
    "lastFollowUpSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "pincode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isNearITHub" BOOLEAN NOT NULL DEFAULT false,
    "rentRange" TEXT,
    "buyRange" TEXT,
    "commuteMap" JSONB,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reraNumber" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'LAUNCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "localityId" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "bhk" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "area" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "bullMQJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opt_ins" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "status" "OptInStatus" NOT NULL DEFAULT 'OPTED_IN',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opt_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "category" "TemplateCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "metaStatus" "TemplateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_ratings" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rera_docs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rera_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "builders_phoneNumberId_key" ON "builders"("phoneNumberId");

-- CreateIndex
CREATE INDEX "builders_phoneNumber_idx" ON "builders"("phoneNumber");

-- CreateIndex
CREATE INDEX "builders_isActive_idx" ON "builders"("isActive");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_location_idx" ON "leads"("location");

-- CreateIndex
CREATE INDEX "leads_builderId_idx" ON "leads"("builderId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_phone_builderId_key" ON "leads"("phone", "builderId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_whatsappMessageId_key" ON "messages"("whatsappMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "localities_name_key" ON "localities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_reraNumber_key" ON "projects"("reraNumber");

-- CreateIndex
CREATE INDEX "follow_ups_scheduledAt_status_idx" ON "follow_ups"("scheduledAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "opt_ins_phone_builderId_key" ON "opt_ins"("phone", "builderId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_name_key" ON "whatsapp_templates"("name");

-- CreateIndex
CREATE INDEX "quality_ratings_builderId_date_idx" ON "quality_ratings"("builderId", "date");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_ins" ADD CONSTRAINT "opt_ins_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_ratings" ADD CONSTRAINT "quality_ratings_builderId_fkey" FOREIGN KEY ("builderId") REFERENCES "builders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rera_docs" ADD CONSTRAINT "rera_docs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX ON properties USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX ON properties USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
