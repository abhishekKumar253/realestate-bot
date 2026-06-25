import type { LeadStatus } from "@prisma/client";

export interface ExportLeadsQuery {
  builderToken: string;
  startDate?: string;
  endDate?: string;
  status?: LeadStatus;
}

export interface HealthCheckResponse {
  status: "ok" | "error";
  uptime: number;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
