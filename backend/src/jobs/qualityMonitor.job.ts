import cron from "node-cron";
import axios from "axios";
import { prisma } from "../db/client";
import { getBuilderById, setBuilderActive } from "../services/builder.service";
import { sendTextMessage } from "../services/whatsapp.service";
import { env } from "../config/env";
import logger from "../utils/logger";

type MetaQualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN";

const getRatingScore = (rating: MetaQualityRating): number => {
  switch (rating) {
    case "GREEN":
      return 100;
    case "YELLOW":
      return 50;
    case "RED":
      return 0;
    default:
      return 0;
  }
};

const fetchMetaQualityRating = async (
  phoneNumberId: string,
  accessToken: string
): Promise<MetaQualityRating | null> => {
  try {
    const url = `https://graph.facebook.com/${env.META_API_VERSION}/${phoneNumberId}?fields=quality_rating`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const rating = response.data.quality_rating;
    if (rating === "GREEN" || rating === "YELLOW" || rating === "RED") {
      return rating;
    }
    return "UNKNOWN";
  } catch (error) {
    logger.error(
      { error, phoneNumberId },
      "Failed to fetch Meta quality rating"
    );
    return null;
  }
};

const checkBuilderQuality = async (builderId: string) => {
  const builder = await getBuilderById(builderId);
  if (!builder?.isActive || !builder?.accessToken) return;

  const rating = await fetchMetaQualityRating(
    builder.phoneNumberId,
    builder.accessToken
  );
  if (!rating) return;

  await prisma.qualityRating.create({
    data: {
      builderId: builder.id,
      rating: getRatingScore(rating),
      date: new Date(),
    },
  });

  const brokerPhone = builder.notificationPhone || builder.phoneNumber;

  if (rating === "RED") {
    logger.error(
      { builderId, rating },
      "RED RATING DETECTED! Pausing builder."
    );
    await setBuilderActive(builder.id, false);

    if (brokerPhone) {
      await sendTextMessage(
        builder.phoneNumberId,
        builder.accessToken,
        brokerPhone,
        "URGENT: Your WhatsApp Quality Rating has turned RED. Due to spam reports, your account may get banned. We have temporarily paused the LeadKaro bot. Please contact admin immediately."
      );
    }
  } else if (rating === "YELLOW") {
    logger.warn({ builderId, rating }, "YELLOW RATING. Warning sent.");
    if (brokerPhone) {
      await sendTextMessage(
        builder.phoneNumberId,
        builder.accessToken,
        brokerPhone,
        "Warning: Your WhatsApp Quality Rating has turned YELLOW. Please only message interested users, otherwise your account may get banned."
      );
    }
  }
};

export const startQualityMonitor = () => {
  cron.schedule("0 * * * *", async () => {
    logger.info("Quality monitor job started");

    try {
      const activeBuilders = await prisma.builder.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const { id } of activeBuilders) {
        try {
          await checkBuilderQuality(id);
        } catch (err) {
          logger.error(
            { err, builderId: id },
            "Quality check failed for builder"
          );
        }
      }
    } catch (error) {
      logger.error({ error }, "Quality monitor job failed");
    }
  });

  logger.info("Quality monitor cron scheduled — every 1 hour");
};
