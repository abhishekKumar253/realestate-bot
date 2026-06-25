import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { generateEmbedding } from "../utils/embeddings";

type PropertyRow = {
  id: string;
  name: string;
  bhk: string;
  price: bigint;
  location: string;
  similarity: number;
};

export const findSimilarProperties = async (
  queryText: string,
  builderId: string,
  limit: number = 5
): Promise<
  Array<{
    id: string;
    name: string;
    bhk: string;
    price: number;
    location: string;
    similarity: number;
  }>
> => {
  const queryEmbedding = await generateEmbedding(queryText);
  const embeddingString = `[${queryEmbedding.join(",")}]`;
  const vector = Prisma.sql`${embeddingString}::vector`;

  const rows: PropertyRow[] = await prisma.$queryRaw`
    SELECT 
      p.id, 
      pr.name, 
      p.bhk, 
      p.price, 
      l.name AS location,
      1 - (p.embedding <=> ${vector}) AS similarity
    FROM properties p
    JOIN projects pr ON p."projectId" = pr.id
    JOIN localities l ON p."localityId" = l.id
    WHERE p.embedding IS NOT NULL
      AND pr."builderId" = ${builderId}
    ORDER BY p.embedding <=> ${vector}
    LIMIT ${limit};
  `;

  return rows.map((p) => ({
    ...p,
    price: Number(p.price),
    similarity: Number(p.similarity),
  }));
};
