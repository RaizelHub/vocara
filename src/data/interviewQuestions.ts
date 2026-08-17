import type { InterviewType } from "@/types/interview";

const STANDARD = [
  "Tell me about yourself.",
  "Tell me about a project you're proud of and what your role was.",
  "Describe a difficult problem you solved recently.",
  "How do you handle feedback?",
  "Why are you interested in this role?",
  "Tell me about a time you worked under pressure.",
  "What is one skill you're currently improving?",
  "Why should we hire you?",
  "How do you prioritize competing deadlines?",
  "Tell me about how you collaborate with a team.",
  "Where do you see yourself in a year?",
  "How do you stay focused during repetitive work?",
];

const BEHAVIORAL = [
  "Tell me about yourself.",
  "Walk me through a project you're proud of and your role in it.",
  "Tell me about a time you resolved a conflict with a teammate.",
  "Describe a problem you solved in an unusual way.",
  "Tell me about a time you received criticism. How did you handle it?",
  "Give an example of a time you worked under pressure.",
  "Tell me about a time you went beyond what was asked of you.",
  "Describe a setback you overcame on the job.",
  "Tell me about a time you led a small team or initiative.",
  "How do you build trust with a new team?",
  "Tell me about a time you made a mistake and how you handled it.",
  "Describe a situation where you had to adapt to change quickly.",
];

const TECHNICAL_DEVELOPMENT = [
  "Tell me about your technical background.",
  "Walk me through a project you've built. What were the key technical decisions?",
  "How would you debug a slow API endpoint in production?",
  "How would you design a system to handle a spike in users?",
  "What is the difference between a stack and a queue? When do you use each?",
  "How do you keep code quality high on a tight deadline?",
  "Describe a time you fixed a difficult production bug under pressure.",
  "How do you test the code you write?",
  "What is your process for learning a new framework quickly?",
  "How would you refactor a large legacy codebase without breaking it?",
  "Explain a technical concept to someone non-technical.",
  "What is the most interesting technical problem you've solved recently?",
];

const TECHNICAL_GENERIC = [
  "Walk me through a task you completed from start to finish.",
  "How do you approach an issue you have never seen before?",
  "How do you decide between urgent tasks and important tasks?",
  "Describe a process you had to understand quickly and master.",
  "How do you verify that your work is correct before submitting it?",
  "What helps you stay organized under a heavy workload?",
  "Explain one of your core skills to a total beginner.",
  "Tell me about a time you automated or improved a repetitive task.",
  "What is your process for learning a new tool or system quickly?",
  "Tell me about a time your approach failed and how you adjusted.",
  "What checks do you run before delivering work?",
  "What is the most challenging problem you have solved in your work?",
];

const MIXED = [
  "Tell me about yourself.",
  "Walk me through a project you've built. What were the important decisions?",
  "Tell me about a time you worked under pressure.",
  "How would you debug a feature that suddenly stopped working?",
  "Tell me about a time you received feedback and how you used it.",
  "Explain a decision you made recently to a colleague.",
  "How do you prioritize when everything feels urgent?",
  "Describe a skill you are currently improving and how you practice it.",
  "Tell me about a time you helped a teammate get back on track.",
  "Where do you see yourself in a year?",
  "Why are you interested in this role?",
  "What do you want to be known for at work?",
];

export function questionsFor(
  type: InterviewType,
  role: string,
  count: number,
): string[] {
  let bank: string[];

  switch (type) {
    case "behavioral":
      bank = BEHAVIORAL;
      break;
    case "technical":
      bank = /developer|software|engineer|programmer/i.test(role)
        ? TECHNICAL_DEVELOPMENT
        : TECHNICAL_GENERIC;
      break;
    case "mixed":
      bank = MIXED;
      break;
    default:
      bank = STANDARD;
  }

  return bank.slice(0, Math.min(count, bank.length));
}

/**
 * Returns up to `count` unique questions sampled randomly from the matching
 * bank. Used by Quick Practice so the single warm-up question varies each time
 * instead of always being the first item in the list.
 */
export function sampleQuestions(
  type: InterviewType,
  role: string,
  count: number,
): string[] {
  const bank =
    type === "behavioral"
      ? BEHAVIORAL
      : type === "technical"
        ? /developer|software|engineer|programmer/i.test(role)
          ? TECHNICAL_DEVELOPMENT
          : TECHNICAL_GENERIC
        : type === "mixed"
          ? MIXED
          : STANDARD;

  const pool = [...bank];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}