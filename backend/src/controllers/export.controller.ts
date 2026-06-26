import type { Response } from "express";
import { format } from "@fast-csv/format";
import { Prisma, LeadStatus } from "@prisma/client";
import { prisma } from "../db/client";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import logger from "../utils/logger";

// ========== Helper: Date validation ==========
const isValidDate = (str: string): boolean => {
  const d = new Date(str);
  return !Number.isNaN(d.getTime());
};

// ========== Helper: Build where clause ==========
const buildWhere = (
  builderId: string,
  startDateStr?: string,
  endDateStr?: string,
  status?: string,
  location?: string
): Prisma.LeadWhereInput => {
  const where: Prisma.LeadWhereInput = { builderId };

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) where.createdAt.gte = new Date(startDateStr);
    if (endDateStr) where.createdAt.lte = new Date(endDateStr);
  }
  if (status) where.status = status as LeadStatus;
  if (location) where.location = { contains: location, mode: "insensitive" };

  return where;
};

// ========== Helper: Validate query params ==========
const validateParams = (
  startDateStr?: string,
  endDateStr?: string,
  status?: string
): { valid: boolean; error?: string } => {
  if (startDateStr && !isValidDate(startDateStr)) {
    return { valid: false, error: "Invalid startDate format" };
  }
  if (endDateStr && !isValidDate(endDateStr)) {
    return { valid: false, error: "Invalid endDate format" };
  }
  if (status && !Object.values(LeadStatus).includes(status as LeadStatus)) {
    return { valid: false, error: "Invalid status filter" };
  }
  return { valid: true };
};

// ========== Helper: Stream leads to CSV ==========
const streamLeadsToCsv = async (
  where: Prisma.LeadWhereInput,
  res: Response
): Promise<void> => {
  const csvStream = format({ headers: true });
  csvStream.pipe(res);

  const BATCH_SIZE = 500;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const leads = await prisma.lead.findMany({
      where,
      skip,
      take: BATCH_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        propertyType: true,
        location: true,
        bhk: true,
        purpose: true,
        timeline: true,
        minBudget: true,
        maxBudget: true,
        score: true,
        status: true,
        siteVisitDay: true,
        siteVisitTime: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (leads.length === 0) break;

    for (const lead of leads) {
      csvStream.write({
        ID: lead.id,
        Name: lead.name ?? "",
        Phone: lead.phone,
        "Property Type": lead.propertyType ?? "",
        Location: lead.location ?? "",
        BHK: lead.bhk ?? "",
        Purpose: lead.purpose ?? "",
        Timeline: lead.timeline ?? "",
        "Min Budget": lead.minBudget ?? "",
        "Max Budget": lead.maxBudget ?? "",
        Score: lead.score ?? 0,
        Status: lead.status,
        "Site Visit": lead.siteVisitDay
          ? `${lead.siteVisitDay} ${lead.siteVisitTime ?? ""}`
          : "",
        "Created At": lead.createdAt.toISOString(),
        "Updated At": lead.updatedAt.toISOString(),
      });
    }

    skip += BATCH_SIZE;
    hasMore = leads.length === BATCH_SIZE;
  }

  csvStream.end();
};

// ========== Main Controller ==========
export const exportLeads = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.builder?.isActive) {
    res
      .status(403)
      .json({ success: false, error: "Invalid or inactive builder" });
    return;
  }

  const startDateStr = req.query.startDate as string | undefined;
  const endDateStr = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  const location = req.query.location as string | undefined;

  const validation = validateParams(startDateStr, endDateStr, status);
  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  const where = buildWhere(
    req.builder.id,
    startDateStr,
    endDateStr,
    status,
    location
  );

  const safeName = req.builder.businessName.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `leads-${safeName}-${
    new Date().toISOString().split("T")[0]
  }.csv`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    await streamLeadsToCsv(where, res);
    logger.info(
      { builderId: req.builder.id, filename },
      "CSV export completed"
    );
  } catch (error) {
    logger.error({ error, builderId: req.builder.id }, "CSV export failed");

    if (res.headersSent) {
      res.end();
      return;
    }

    res.status(500).json({ success: false, error: "Export failed" });
  }
};
