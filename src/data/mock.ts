export type MockSession = {
  id: string;
  title: string;
  type: "Mock interview" | "Job-specific" | "Quick practice";
  minutes: number;
  score: number;
  date: string;
};

export const mockProgress = {
  readinessScore: 82,
  readinessChange: 6,
  streak: 6,
  longestStreak: 11,
  sessionsCompleted: 12,
  practiceMinutes: 102,
  weeklyPractice: [true, true, true, false, true, true, false],
  skills: [
    { key: "clarity", label: "Clarity", value: 86 },
    { key: "grammar", label: "Grammar", value: 91 },
    { key: "confidence", label: "Confidence", value: 74 },
    { key: "structure", label: "Structure", value: 83 },
  ],
};