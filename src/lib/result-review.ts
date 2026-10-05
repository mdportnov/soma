type ReviewResult = {
  valueNormalized: number | null;
  confidence: string | null;
};

export function resultReviewReason(result: ReviewResult): string {
  if (result.valueNormalized == null) return "verify.reasonUnit";
  if (result.confidence === "ai") return "verify.reasonAi";
  if (result.confidence === "translated") return "verify.reasonTranslated";
  if (result.confidence === "fuzzy") return "verify.reasonFuzzy";
  return "verify.reasonDefault";
}
