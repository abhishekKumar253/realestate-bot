import { prisma } from "./db/client";
import { redis } from "./config/redis";

async function main() {
  await prisma.$connect();
  console.log("✅ Database connected");

  await redis.ping();
  console.log("✅ Redis connected");

  await prisma.$disconnect();
  await redis.quit();
}

main().catch(console.error);
