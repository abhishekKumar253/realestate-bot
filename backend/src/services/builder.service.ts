import { prisma } from "../db/client";
import { encryptToken, decryptToken } from "../utils/crypto";
import logger from "../utils/logger";

export interface CreateBuilderInput {
  businessName: string;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
  verifyToken: string;
  phoneNumber?: string;
  notificationPhone?: string;
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

const builderCache = new Map<
  string,
  { data: BuilderWithToken; expiresAt: number }
>();

const CACHE_TTL = 5 * 60 * 1000;

const getCached = (phoneNumberId: string): BuilderWithToken | null => {
  const cached = builderCache.get(phoneNumberId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    builderCache.delete(phoneNumberId);
    return null;
  }
  return cached.data;
};

const setCache = (phoneNumberId: string, data: BuilderWithToken): void => {
  builderCache.set(phoneNumberId, {
    data,
    expiresAt: Date.now() + CACHE_TTL,
  });
};

export const invalidateBuilderCache = (phoneNumberId: string): void => {
  builderCache.delete(phoneNumberId);
  logger.info({ phoneNumberId }, "🗑️ Builder cache invalidated");
};

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
      notificationPhone: input.notificationPhone,
      systemPrompt: input.systemPrompt,
    },
    select: {
      id: true,
      businessName: true,
      phoneNumberId: true,
      wabaId: true,
      verifyToken: true,
      phoneNumber: true,
      notificationPhone: true,
      systemPrompt: true,
      isActive: true,
    },
  });

  logger.info({ builderId: builder.id }, "Builder created");

  return {
    ...builder,
    accessToken: input.accessToken,
  };
};

export const getBuilderByPhoneNumberId = async (
  phoneNumberId: string
): Promise<BuilderWithToken | null> => {
  const cached = getCached(phoneNumberId);
  if (cached) return cached;

  const builder = await prisma.builder.findUnique({
    where: { phoneNumberId },
    select: {
      id: true,
      businessName: true,
      phoneNumberId: true,
      encryptedToken: true,
      notificationPhone: true,
      systemPrompt: true,
      isActive: true,
      verifyToken: true,
      wabaId: true,
      phoneNumber: true,
    },
  });

  if (!builder) return null;

  try {
    const accessToken = decryptToken(builder.encryptedToken);
    const result: BuilderWithToken = { ...builder, accessToken };
    setCache(phoneNumberId, result);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error(
      { builderId: builder.id, error: message },
      "Failed to decrypt token"
    );
    return null;
  }
};

export const getBuilderById = async (
  id: string
): Promise<BuilderWithToken | null> => {
  const builder = await prisma.builder.findUnique({
    where: { id },
    select: {
      id: true,
      businessName: true,
      phoneNumberId: true,
      encryptedToken: true,
      notificationPhone: true,
      systemPrompt: true,
      isActive: true,
      verifyToken: true,
      wabaId: true,
      phoneNumber: true,
    },
  });

  if (!builder) return null;

  try {
    const accessToken = decryptToken(builder.encryptedToken);
    return { ...builder, accessToken };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ builderId: id, error: message }, "Failed to decrypt token");
    return null;
  }
};

export const setBuilderActive = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  const builder = await prisma.builder.update({
    where: { id },
    data: { isActive },
  });

  invalidateBuilderCache(builder.phoneNumberId);

  logger.info({ builderId: id, isActive }, "Builder status updated");
};
