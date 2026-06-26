import { LeadKaroState } from "../../types/langgraph.types";
import { scheduleFollowUp } from "../../services/followup.service";
import { updateLead } from "../../services/lead.service";
import { calculateLeadScore } from "../../utils/helpers";
import { brokerAlertQueue } from "../../workers/brokerAlert.worker";
import logger from "../../utils/logger";

export const scheduleFollowupNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  try {
    const score = calculateLeadScore(state.extractedData);

    await updateLead(state.leadId, { score });

    if (state.isQualified && score >= 80) {
      await brokerAlertQueue.add(`alert-${state.leadId}`, {
        leadId: state.leadId,
      });
      logger.info({ waId: state.waId, score }, "Broker alert triggered");
    }

    if (state.shouldFollowUp && state.followUpType) {
      const delays = {
        "2H": 2 * 60 * 60 * 1000,
        "24H": 24 * 60 * 60 * 1000,
        "72H": 72 * 60 * 60 * 1000,
      };

      await scheduleFollowUp(
        state.leadId,
        state.followUpType,
        delays[state.followUpType]
      );
      logger.info(
        { waId: state.waId, type: state.followUpType },
        "Follow-up scheduled"
      );
    }

    return {
      shouldFollowUp: false,
      followUpType: undefined,
    };
  } catch (error) {
    logger.error({ error, waId: state.waId }, "Failed to schedule follow-up");
    return {
      shouldFollowUp: false,
      followUpType: undefined,
    };
  }
};
