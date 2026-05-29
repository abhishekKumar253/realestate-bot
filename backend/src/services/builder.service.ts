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

// ─── In-Memory Builder Cache ──────────────────────────────────────────────────
const builderCache = new Map<
  string,
  { data: BuilderWithToken; expiresAt: number }
>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

// Cache invalidate karo jab builder update ho
export const invalidateBuilderCache = (phoneNumberId: string): void => {
  builderCache.delete(phoneNumberId);
  logger.info({ phoneNumberId }, "🗑️ Builder cache invalidated");
};

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
// CHANGED: Cache add kiya — har message pe DB hit nahi hoga

export const getBuilderByPhoneNumberId = async (
  phoneNumberId: string
): Promise<BuilderWithToken | null> => {
  // Cache check
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
  } catch (err) {
    logger.error(
      { builderId: builder.id, error: err },
      "Failed to decrypt token"
    );
    return null;
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
    return { ...builder, accessToken };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ builderId: id, error: message }, "Failed to decrypt token");
    return null;
  }
};

// ─── setBuilderActive ─────────────────────────────────────────────────────────

export const setBuilderActive = async (
  id: string,
  isActive: boolean
): Promise<void> => {
  const builder = await prisma.builder.update({
    where: { id },
    data: { isActive },
  });

  // Cache invalidate karo taaki next request fresh data le
  invalidateBuilderCache(builder.phoneNumberId);

  logger.info({ builderId: id, isActive }, "Builder status updated");
};
