import { LeadStatus } from "@prisma/client";
import { prisma } from "./client";

export const findLeadByPhoneAndBuilder = async (
  phone: string,
  builderId: string
) => {
  return prisma.lead.findUnique({
    where: { phone_builderId: { phone, builderId } },
  });
};

export const createLead = async (data: {
  phone: string;
  builderId: string;
  name?: string;
}) => {
  return prisma.lead.create({
    data: {
      phone: data.phone,
      name: data.name,
      builder: { connect: { id: data.builderId } },
    },
  });
};

export const updateLeadData = async (
  leadId: string,
  data: {
    status?: LeadStatus;
    score?: number;
    minBudget?: number;
    maxBudget?: number;
    location?: string;
    bhk?: string;
    name?: string;
  }
) => {
  return prisma.lead.update({
    where: { id: leadId },
    data,
  });
};

export const getLeadsForDailySummary = async (builderId: string) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return prisma.lead.findMany({
    where: {
      builderId,
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
  });
};
