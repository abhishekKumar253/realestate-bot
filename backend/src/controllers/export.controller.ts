import type { Response } from "express";
import { format } from "@fast-csv/format";
import { Prisma, LeadStatus } from "@prisma/client";
import { prisma } from "../db/client";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import logger from "../utils/logger";

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

  // Validations
  const startDateStr = req.query.startDate as string | undefined;
  const endDateStr = req.query.endDate as string | undefined;
  const status = req.query.status as string | undefined;
  const location = req.query.location as string | undefined;

  if (startDateStr) {
    const d = new Date(startDateStr);
    if (isNaN(d.getTime())) {
      res
        .status(400)
        .json({ success: false, error: "Invalid startDate format" });
      return;
    }
  }

  if (endDateStr) {
    const d = new Date(endDateStr);
    if (isNaN(d.getTime())) {
      res.status(400).json({ success: false, error: "Invalid endDate format" });
      return;
    }
  }

  if (status && !Object.values(LeadStatus).includes(status as LeadStatus)) {
    res.status(400).json({ success: false, error: "Invalid status filter" });
    return;
  }

  const where: Prisma.LeadWhereInput = { builderId: req.builder.id };

  if (startDateStr || endDateStr) {
    where.createdAt = {};
    if (startDateStr) where.createdAt.gte = new Date(startDateStr);
    if (endDateStr) where.createdAt.lte = new Date(endDateStr);
  }
  if (status) where.status = status as LeadStatus;
  if (location) where.location = { contains: location, mode: "insensitive" };

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
