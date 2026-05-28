import { prisma } from "../db/prisma";
import { encryptToken, decryptToken } from "../utils/crypto";
import logger from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CreateBuilderInput {
  businessName: string;
  phoneNumberId: string;
  accessToken: string;     
  wabaId: string;
  verifyToken: string;
  phoneNumber?: string;
  systemPrompt?: string;
}

export interface BuilderWithToken {
  id: string;
  businessName: string;
  phoneNumberId: string;
  accessToken: string;     
  wabaId: string;
  verifyToken: string | null;
  phoneNumber: string | null;
  notificationPhone: string | null;
  systemPrompt: string | null;
  isActive: boolean;
}

// ─── createBuilder ────────────────────────────────────────────────────────────

export const createBuilder = async (
  input: CreateBuilderInput
): Promise<BuilderWithToken> => {
  const encryptedToken = encryptToken(input.accessToken);

  const builder = await prisma.builder.create({
    data: {
      businessName: input.businessName,
      phoneNumberId: input.phoneNumberId,
      encryptedToken,
      wabaId: input.wabaId,
      verifyToken: input.verifyToken,
      phoneNumber: input.phoneNumber,
      systemPrompt: input.systemPrompt,
    },
  });

  logger.info({ builderId: builder.id }, "Builder created");

  return {
    ...builder,
    accessToken: input.accessToken,  
  };
};

// ─── getBuilderByPhoneNumberId ────────────────────────────────────────────────
export const getBuilderByPhoneNumberId = async (
  phoneNumberId: string
): Promise<BuilderWithToken | null> => {
  const builder = await prisma.builder.findUnique({
    where: { phoneNumberId },
  });

  if (!builder) return null;

  try {
    const accessToken = decryptToken(builder.encryptedToken);
    return {
      ...builder,
      accessToken,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(
      { builderId: builder.id, error: message },
      "Failed to decrypt token — check TOKEN_ENCRYPTION_KEY"
    );
    return null;           // treat as not found — bot won't reply with wrong token
  }
};

// ─── getBuilderById ───────────────────────────────────────────────────────────

export const getBuilderById = async (
  id: string
): Promise<BuilderWithToken | null> => {
  const builder = await prisma.builder.findUnique({
    where: { id },
  });

  if (!builder) return null;

  try {
    const accessToken = decryptToken(builder.encryptedToken);
    return {
      ...builder,
      accessToken,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(
      { builderId: id, error: message },
      "Failed to decrypt token"
    );
    return null;
  }
};

// ─── setBuilderActive ─────────────────────────────────────────────────────────

export const setBuilderActive = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  await prisma.builder.update({
    where: { id },
    data: { isActive },
  });

  logger.info({ builderId: id, isActive }, "Builder status updated");
};