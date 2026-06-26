import { prisma } from "../src/db/client";
import { encryptToken } from "../src/utils/crypto";
import { HYDERABAD_LOCALITIES } from "../src/constants/hyderabad.localities";

const seed = async () => {
  console.log("🌱 Seeding builder data...");

  const encryptedToken = encryptToken("dummy_access_token_for_dev");

  const builder = await prisma.builder.create({
    data: {
      businessName: "Demo Builders Hyderabad",
      phoneNumberId: "123456789012345",
      encryptedToken,
      wabaId: "987654321098765",
      verifyToken: "dev_verify_token_123",
      phoneNumber: "+919999999999",
      notificationPhone: "+919999999999",
      isActive: true,
    },
  });

  console.log(`✅ Builder created: ${builder.id}`);

  // Seed localities if empty
  const localityCount = await prisma.locality.count();
  if (localityCount === 0) {
    const data = HYDERABAD_LOCALITIES.map((loc) => ({
      name: loc.name,
      area: loc.area,
      pincode: loc.pincode,
      latitude: loc.latitude,
      longitude: loc.longitude,
      isNearITHub: loc.isNearITHub,
      rentRange: loc.rentRange,
      buyRange: loc.buyRange,
      commuteMap: loc.commuteMap ?? undefined,
    }));

    await prisma.locality.createMany({ data, skipDuplicates: true });
    console.log(`✅ ${data.length} localities seeded`);
  }

  await prisma.$disconnect();
  console.log("🔌 Done");
};

seed().catch(async (e) => {
  console.error("❌ Seed failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
