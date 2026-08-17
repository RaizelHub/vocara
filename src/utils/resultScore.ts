export type ScoreInterpretation =
  | "Excellent"
  | "Strong"
  | "Good"
  | "Developing"
  | "Needs focus";

export function interpretScore(score: number): ScoreInterpretation {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 60) return "Developing";
  return "Needs focus";
}
