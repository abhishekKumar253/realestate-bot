import type { Request, Response } from "express";
import { prisma } from "../db/prisma";
import logger from "../utils/logger";

// Human-readable mappings
const timelineMap: Record<string, string> = {
  ONE_MONTH: "1 Month",
  THREE_MONTHS: "3 Months",
  SIX_MONTHS: "6 Months",
  MORE_THAN_SIX_MONTHS: "6+ Months",
};

const statusMap: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_DONE: "Site Visit Done",
  CONVERTED: "Converted",
  LOST: "Lost",
};

const purposeMap: Record<string, string> = {
  INVESTMENT: "Investment",
  END_USE: "Khud Rehne Ke Liye",
};

const possessionMap: Record<string, string> = {
  READY_TO_MOVE: "Ready To Move",
  UNDER_CONSTRUCTION: "Under Construction",
};

const loanStatusMap: Record<string, string> = {
  PRE_APPROVED: "Pre Approved",
  APPLIED: "Applied",
  NONE: "No Loan",
};

/**
 * GET /export/leads?token=VERIFY_TOKEN
 * Authenticates builder via verifyToken and returns CSV of all leads.
 */
export const exportLeads = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // ── 1. Authentication ──
    const token = req.query["token"] as string;
    if (!token) {
      res.status(401).json({ error: "Token required" });
      return;
    }

    const builder = await prisma.builder.findFirst({
      where: { verifyToken: token, isActive: true },
    });

    if (!builder) {
      res.status(403).json({ error: "Invalid token or builder inactive" });
      return;
    }

    // ── 2. Fetch leads ──
    const leads = await prisma.lead.findMany({
      where: { builderId: builder.id },
      orderBy: { createdAt: "desc" },
    });

    // ── 3. CSV Headers ──
    const headers = [
      "Name",
      "Phone",
      "Property Type",
      "BHK",
      "Location",
      "Budget",
      "Min Budget (Rs)",
      "Max Budget (Rs)",
      "Purpose",
      "Timeline",
      "Amenities",
      "Possession",
      "Loan Status",
      "Site Visit Day",
      "Site Visit Time",
      "Status",
      "Created At",
    ];

    // ── 4. CSV Rows ──
    const rows = leads.map((lead) => {
      const cells = [
        lead.name ?? "",
        `+${lead.phone}`,
        lead.propertyType ?? "",
        lead.bhk ?? "",
        lead.location ?? "",
        lead.budget ?? "",
        lead.minBudget?.toString() ?? "",
        lead.maxBudget?.toString() ?? "",
        lead.purpose ? purposeMap[lead.purpose] ?? lead.purpose : "",
        lead.timeline ? timelineMap[lead.timeline] ?? lead.timeline : "",
        lead.amenities ?? "",
        lead.possession
          ? possessionMap[lead.possession] ?? lead.possession
          : "",
        lead.loanStatus
          ? loanStatusMap[lead.loanStatus] ?? lead.loanStatus
          : "",
        lead.siteVisitDay ?? "",
        lead.siteVisitTime ?? "",
        statusMap[lead.status] ?? lead.status,
        lead.createdAt.toLocaleDateString("en-IN"),
      ];

      return cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",");
    });

    // ── 5. Build CSV ──
    const csvContent = [headers.join(","), ...rows].join("\n");

    // ── 6. Send file with BOM for Excel Hindi support ──
    const BOM = "\uFEFF";
    const filename = `leads_${builder.businessName.replace(/\s+/g, "_")}_${
      new Date().toISOString().split("T")[0]
    }.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(BOM + csvContent);

    logger.info(
      { builderId: builder.id, count: leads.length },
      "✅ Leads exported"
    );
  } catch (error) {
    logger.error({ error }, "❌ Export failed");
    res.status(500).json({ error: "Export failed" });
  }
};
