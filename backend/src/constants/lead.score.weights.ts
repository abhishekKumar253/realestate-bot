export const LEAD_SCORE_WEIGHTS = {
  BUDGET: 20,
  LOCATION: 20,
  TIMELINE: 15,
  BHK: 10,
  PURPOSE: 15,
  SITE_VISIT: 20,
} as const;

export const TOTAL_LEAD_SCORE = Object.values(LEAD_SCORE_WEIGHTS).reduce(
  (a, b) => a + b,
  0
); 
