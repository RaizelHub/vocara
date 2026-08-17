import type { SpeakingCategory, SpeakingPrompt } from "@/types/speaking";

type RawPrompt = Omit<SpeakingPrompt, "category"> & { category: SpeakingCategory };

const PROMPT_LIBRARY: RawPrompt[] = [
  // everyday -----------------------------------------------------------------
  {
    id: "everyday-weekend",
    category: "everyday",
    text: "What did you do last weekend?",
    tip: "Share two or three moments in a natural order — no need to summarize everything.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "everyday-food",
    category: "everyday",
    text: "What is a meal you enjoy making, and why?",
    tip: "Describe the steps loosely; focus on why you enjoy it.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "everyday-city",
    category: "everyday",
    text: "What is your favorite place in your city or town?",
    tip: "Paint a quick picture — what it looks like, what you do there.",
    difficulty: "warm_up",
    timeLimitSeconds: 90,
  },
  {
    id: "everyday-habit",
    category: "everyday",
    text: "Describe a small habit that makes your day better.",
    tip: "Explain the habit, then one concrete benefit.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },
  {
    id: "everyday-travel",
    category: "everyday",
    text: "If you could spend a week anywhere in the world, where would you go and what would you do?",
    tip: "Give one main destination and one memorable activity.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },

  // workplace ----------------------------------------------------------------
  {
    id: "workplace-tasks",
    category: "workplace",
    text: "What does a typical workday look like for you?",
    tip: "Walk through a loose arc: start, main work, end of day.",
    difficulty: "warm_up",
    timeLimitSeconds: 90,
  },
  {
    id: "workplace-team",
    category: "workplace",
    text: "How do you stay aligned with your team on a busy week?",
    tip: "One concrete practice is enough — how it helps is the point.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },
  {
    id: "workplace-deadline",
    category: "workplace",
    text: "Tell me about a time you delivered something under a tight deadline.",
    tip: "Keep it short: the task, one key action, the outcome.",
    difficulty: "moderate",
    timeLimitSeconds: 120,
  },
  {
    id: "workplace-disagree",
    category: "workplace",
    text: "How would you handle disagreeing with a colleague in a meeting?",
    tip: "Describe your approach, not a scripted answer.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },
  {
    id: "workplace-remote",
    category: "workplace",
    text: "What makes remote or hybrid work hard, and how do you manage it?",
    tip: "Name one real difficulty and one concrete strategy.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },

  // introduction -------------------------------------------------------------
  {
    id: "introduction-self",
    category: "introduction",
    text: "Introduce yourself in one minute.",
    tip: "Start with who you are, then what you do and one interest.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "introduction-experience",
    category: "introduction",
    text: "Tell me about your professional background so far.",
    tip: "Follow your journey in order; skip anything you can't explain in one line.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },
  {
    id: "introduction-skills",
    category: "introduction",
    text: "What two skills are you best at, and how did you build them?",
    tip: "Pick skills you can support with a short example.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },
  {
    id: "introduction-motivation",
    category: "introduction",
    text: "What motivates you to grow in your career right now?",
    tip: "One genuine reason is stronger than a list of buzzwords.",
    difficulty: "challenging",
    timeLimitSeconds: 90,
  },

  // storytelling -------------------------------------------------------------
  {
    id: "storytelling-project",
    category: "storytelling",
    text: "Describe a project you finished and are proud of.",
    tip: "Use a simple arc: situation, what you did, what happened.",
    difficulty: "moderate",
    timeLimitSeconds: 120,
  },
  {
    id: "storytelling-mistake",
    category: "storytelling",
    text: "Tell me about a mistake you made and what you learned from it.",
    tip: "Own the mistake briefly, then give the lesson the most time.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },
  {
    id: "storytelling-someone-helped",
    category: "storytelling",
    text: "Tell me about a time you helped someone solve a problem.",
    tip: "Focus on the moment you understood what they needed.",
    difficulty: "moderate",
    timeLimitSeconds: 120,
  },
  {
    id: "storytelling-changed",
    category: "storytelling",
    text: "Share a story about a time your point of view changed.",
    tip: "What happened first, what made you reconsider, what you think now.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },

  // opinion ------------------------------------------------------------------
  {
    id: "opinion-ai-tools",
    category: "opinion",
    text: "Do you think AI tools make work easier or more complicated?",
    tip: "Take a clear side, then give one real reason.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },
  {
    id: "opinion-morning",
    category: "opinion",
    text: "Are you a morning person or a night person? Why?",
    tip: "State your side early; evidence beats clichés.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "opinion-remote-work",
    category: "opinion",
    text: "Should teams be fully remote, fully in-office, or hybrid?",
    tip: "Pick one position and defend it with a concrete example.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },
  {
    id: "opinion-learning",
    category: "opinion",
    text: "What is the best way to learn something new quickly?",
    tip: "Share your own method — a framework is fine, an example is better.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },

  // explanation --------------------------------------------------------------
  {
    id: "explanation-hobby",
    category: "explanation",
    text: "Explain your favorite hobby to someone who has never tried it.",
    tip: "Start from what it is, then why it draws people in.",
    difficulty: "warm_up",
    timeLimitSeconds: 90,
  },
  {
    id: "explanation-last-learned",
    category: "explanation",
    text: "Explain the last new thing you learned at work or in your studies.",
    tip: "Assume the listener knows the basics; focus on your new understanding.",
    difficulty: "moderate",
    timeLimitSeconds: 120,
  },
  {
    id: "explanation-simple",
    category: "explanation",
    text: "Explain something you're good at in simple terms.",
    tip: "If you reach for jargon, translate it in the same sentence.",
    difficulty: "challenging",
    timeLimitSeconds: 120,
  },
  {
    id: "explanation-process",
    category: "explanation",
    text: "Walk me through how you prepare for a busy day.",
    tip: "Give the steps in order, and say why each one matters.",
    difficulty: "moderate",
    timeLimitSeconds: 90,
  },

  // quick_response ------------------------------------------------------------
  {
    id: "quick-proud",
    category: "quick_response",
    text: "What are you most proud of from the last month?",
    tip: "One sentence for what, one for why.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "quick-priority",
    category: "quick_response",
    text: "What is your number one priority right now?",
    tip: "Be specific and honest; no hedging.",
    difficulty: "warm_up",
    timeLimitSeconds: 60,
  },
  {
    id: "quick-challenge",
    category: "quick_response",
    text: "Tell me about something you found challenging this week.",
    tip: "Pick one moment, explain it, stop.",
    difficulty: "moderate",
    timeLimitSeconds: 60,
  },
  {
    id: "quick-strength",
    category: "quick_response",
    text: "What is one strength your colleagues would name about you?",
    tip: "Answer directly, then support it with a quick example.",
    difficulty: "moderate",
    timeLimitSeconds: 60,
  },
  {
    id: "quick-change",
    category: "quick_response",
    text: "If you could change one thing about your routine, what would it be?",
    tip: "Name the change and the expected result in two sentences.",
    difficulty: "challenging",
    timeLimitSeconds: 60,
  },
];

export const SPEAKING_PROMPTS: SpeakingPrompt[] = PROMPT_LIBRARY;

const PROMPT_BY_ID = new Map(SPEAKING_PROMPTS.map((prompt) => [prompt.id, prompt]));

export function promptById(id: string | null | undefined) {
  if (!id) return null;
  return PROMPT_BY_ID.get(id) ?? null;
}

export function promptsForCategory(category: SpeakingCategory) {
  return SPEAKING_PROMPTS.filter((prompt) => prompt.category === category);
}

function dayIndex(now: Date) {
  return Math.floor(now.getTime() / 86_400_000);
}

export function dailyPrompt(now = new Date()) {
  const index = dayIndex(now) % SPEAKING_PROMPTS.length;
  return SPEAKING_PROMPTS[index];
}

export function randomPrompt(excludeId?: string) {
  const pool = SPEAKING_PROMPTS.filter((prompt) => prompt.id !== excludeId);
  const list = pool.length > 0 ? pool : SPEAKING_PROMPTS;
  return list[Math.floor(Math.random() * list.length)];
}