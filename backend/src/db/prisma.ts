import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!globalForPrisma.prisma) {
  const connectionString = process.env.DATABASE_URL!;

  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool as any);

  globalForPrisma.prisma = new PrismaClient({
    adapter,
    log: ["error"],
  });
}

export const prisma = globalForPrisma.prisma as PrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;