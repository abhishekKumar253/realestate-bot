export const HYDERABAD_COMMUTE_MAP: Record<string, Record<string, string>> = {
  "hitec city": {
    gachibowli: "5 km",
    kondapur: "4 km",
    madhapur: "2 km",
    kothaguda: "3 km",
    kukatpally: "12 km",
    miyapur: "14 km",
    "financial district": "4 km",
  },
  gachibowli: {
    "hitec city": "5 km",
    kondapur: "3 km",
    nallagandla: "6 km",
    manikonda: "5 km",
    "financial district": "2 km",
  },
  "financial district": {
    gachibowli: "2 km",
    "hitec city": "4 km",
    nallagandla: "7 km",
  },
};

export const getCommuteDistance = (from: string, to: string): string | null => {
  const normalized = (s: string) => s.toLowerCase().trim();
  const f = normalized(from);
  const t = normalized(to);

  const direct = HYDERABAD_COMMUTE_MAP[f]?.[t];
  if (direct) return direct;

  const reverse = HYDERABAD_COMMUTE_MAP[t]?.[f];
  if (reverse) return reverse;

  return null;
};
