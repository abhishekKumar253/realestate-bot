import { prisma } from "../src/db/client";
import { generateEmbedding } from "../src/utils/embeddings";

const updateEmbeddings = async () => {
  console.log("🔄 Updating property embeddings...");

  const properties = await prisma.$queryRaw<any[]>`
    SELECT p.id, p.type, p.bhk, p.price, p.area, p."projectId", p."localityId",
           l.name as "localityName", pr.name as "projectName"
    FROM properties p
    JOIN localities l ON p."localityId" = l.id
    JOIN projects pr ON p."projectId" = pr.id
    WHERE p.embedding IS NULL
    LIMIT 100
  `;

  if (properties.length === 0) {
    console.log("✅ All properties already have embeddings");
    await prisma.$disconnect();
    return;
  }

  console.log(`📦 Found ${properties.length} properties without embeddings`);

  for (const property of properties) {
    try {
      const text = `${property.type} ${property.bhk} in ${property.localityName}, ${property.projectName}. Price: ${property.price}L. Area: ${property.area}sqft.`;

      const embedding = await generateEmbedding(text);

      const embeddingString = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE properties 
        SET embedding = ${embeddingString}::vector(1536) 
        WHERE id = ${property.id}
      `;

      console.log(`✅ Embedding updated: ${property.id}`);
    } catch (error) {
      console.error(`❌ Failed for ${property.id}:`, error);
    }
  }

  await prisma.$disconnect();
  console.log("🔌 Done");
};

updateEmbeddings().catch(async (e) => {
  console.error("❌ Update failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
