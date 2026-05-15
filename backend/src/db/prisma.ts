import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { env } from "../config/index";

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!globalForPrisma.prisma) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaNeon(pool as any);

  globalForPrisma.prisma = new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma; 

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;