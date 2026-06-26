import { prisma } from "../src/db/client";
import {
  HYDERABAD_LOCALITIES,
  type LocalityData,
} from "../src/constants/hyderabad.localities";

const seedLocalities = async () => {
  console.log("🌱 Seeding Hyderabad localities...");

  const data: {
    name: string;
    area?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
    isNearITHub: boolean;
    rentRange?: string;
    buyRange?: string;
    commuteMap?: Record<string, string>;
  }[] = HYDERABAD_LOCALITIES.map((loc: LocalityData) => ({
    name: loc.name,
    area: loc.area,
    pincode: loc.pincode,
    latitude: loc.latitude,
    longitude: loc.longitude,
    isNearITHub: loc.isNearITHub,
    rentRange: loc.rentRange,
    buyRange: loc.buyRange,
    commuteMap: loc.commuteMap,
  }));

  const result = await prisma.locality.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(`✅ ${result.count} localities seeded successfully.`);
};

seedLocalities().catch((e) => {
  console.error("❌ Failed to seed localities:", e);
  process.exit(1);
});
