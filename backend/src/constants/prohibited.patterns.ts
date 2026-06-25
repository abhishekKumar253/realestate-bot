const escape = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\\$&`);

export const PROHIBITED_PATTERNS = [
  "guaranteed return",
  "assured return",
  "100% safe investment",
  "double your money",
  "risk free",
  "fake rera",
  "without rera",
  "govt approved discount",
  "limited time only",
  "only 1 left",
  "sold out book now",
].map((p) => new RegExp(String.raw`\b${escape(p)}\b`, "i"));
