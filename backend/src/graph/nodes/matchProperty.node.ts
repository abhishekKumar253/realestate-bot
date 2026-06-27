import {
  LeadKaroState,
  MatchPropertyOutput,
} from "../../types/langgraph.types";
import { getMatchingProperties } from "../../services/property.service";
import logger from "../../utils/logger";

export const matchPropertyNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  try {
    const hasSpecificFilters =
      state.extractedData.location &&
      (state.extractedData.minBudget || state.extractedData.maxBudget);

    const matchedProperties: MatchPropertyOutput["matchedProperties"] =
      await getMatchingProperties(
        hasSpecificFilters ? state.extractedData : {},
        state.currentMessage,
        state.builderId
      );

    logger.info(
      {
        waId: state.waId,
        count: matchedProperties.length,
        searchType: hasSpecificFilters ? "sql" : "semantic",
      },
      `Matched ${matchedProperties.length} properties`
    );

    return {
      matchedProperties,
      shouldFollowUp: false,
      followUpType: undefined,
    };
  } catch (error) {
    logger.error({ error, waId: state.waId }, "Property matching failed");
    return {
      matchedProperties: [],
      shouldFollowUp: false,
      followUpType: undefined,
    };
  }
};
