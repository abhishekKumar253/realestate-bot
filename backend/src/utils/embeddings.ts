import { openai } from "../config/openai";
import logger from "../utils/logger";

export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small", 
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    logger.error({ error }, "❌ Failed to generate embedding");
    throw new Error("Embedding generation failed");
  }
};
