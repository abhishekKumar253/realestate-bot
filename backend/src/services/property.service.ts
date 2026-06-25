import { prisma } from "../db/client";
import { findSimilarProperties } from "../db/property.queries";
import { PropertyType } from "@prisma/client";
import logger from "../utils/logger";

export interface PropertyFilters {
  builderId: string;
  type?: PropertyType;
  bhk?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  status?: string;
}

export interface PropertyResult {
  id: string;
  name: string;
  bhk: string;
  price: number;
  location: string;
  similarity?: number;
}

// ========== 1. Structured Search (SQL Filters) ==========
export const searchProperties = async (
  filters: PropertyFilters
): Promise<PropertyResult[]> => {
  try {
    const properties = await prisma.property.findMany({
      where: {
        status: filters.status ?? "AVAILABLE",
        project: {
          builderId: filters.builderId,
        },
        type: filters.type,
        bhk: filters.bhk,
        price: {
          gte: filters.minPrice,
          lte: filters.maxPrice,
        },
        locality: {
          name: filters.location,
        },
      },
      include: {
        project: { select: { name: true } },
        locality: { select: { name: true } },
      },
      take: 5,
      orderBy: { price: "asc" },
    });

    return properties.map((p) => ({
      id: p.id,
      name: p.project.name,
      bhk: p.bhk,
      price: p.price,
      location: p.locality.name,
    }));
  } catch (error) {
    logger.error({ error, filters }, "❌ Failed to search properties");
    return [];
  }
};

// ========== 2. Semantic Search (pgvector) ==========
export const semanticSearchProperties = async (
  queryText: string,
  builderId: string
): Promise<PropertyResult[]> => {
  try {
    return await findSimilarProperties(queryText, builderId, 5);
  } catch (error) {
    logger.error(
      { error, queryText, builderId },
      "❌ Failed to semantically search properties"
    );
    return [];
  }
};

// ========== 3. Smart Router ==========
export const getMatchingProperties = async (
  extractedData: {
    location?: string;
    bhk?: string;
    minBudget?: number;
    maxBudget?: number;
    propertyType?: PropertyType;
  },
  userMessage: string,
  builderId: string
): Promise<PropertyResult[]> => {
  const hasEnoughFilters =
    extractedData.location ??
    extractedData.bhk ??
    extractedData.minBudget ??
    extractedData.maxBudget;

  if (hasEnoughFilters) {
    return searchProperties({
      builderId,
      location: extractedData.location,
      bhk: extractedData.bhk,
      type: extractedData.propertyType,
      minPrice: extractedData.minBudget,
      maxPrice: extractedData.maxBudget,
    });
  }

  return semanticSearchProperties(userMessage, builderId);
};

// ========== 4. Update Embedding ==========
export const updatePropertyEmbedding = async (
  propertyId: string
): Promise<void> => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        project: { select: { name: true, description: true } },
        locality: { select: { name: true, area: true } },
      },
    });

    if (!property) return;

    const textToEmbed = `${property.project.name} ${
      property.project.description ?? ""
    } ${property.bhk} BHK ${property.type} in ${property.locality.name} ${
      property.locality.area ?? ""
    } price ${property.price} rupees`;

    const { generateEmbedding } = await import("../utils/embeddings.js");
    const embedding = await generateEmbedding(textToEmbed);
    const embeddingString = `[${embedding.join(",")}]`;

    await prisma.$executeRaw`
      UPDATE properties 
      SET embedding = ${embeddingString}::vector 
      WHERE id = ${propertyId}
    `;

    logger.info({ propertyId }, "✅ Property embedding updated");
  } catch (error) {
    logger.error(
      { error, propertyId },
      "❌ Failed to update property embedding"
    );
  }
};
