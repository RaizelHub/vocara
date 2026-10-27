import { strict as assert } from "node:assert";

import {
  SPEAKING_SCORE_WEIGHTS,
  calculateSpeakingOverallScore,
  countSpeakingFillerWords,
  isSpeakingTranscriptInsufficient,
  type SpeakingCategoryScores,
} from "../_shared/speakingConfig.ts";
import {
  SpeakingEvaluationValidationError,
  validateSpeakingEvaluation,
} from "../_shared/speakingSchemas.ts";

const scores: SpeakingCategoryScores = {
  clarity: 80,
  fluency: 70,
  grammar: 90,
  vocabulary: 60,
  structure: 85,
  conciseness: 50,
};

Deno.test("speaking weights match the documented weighted overall score", () => {
  assert.deepEqual(SPEAKING_SCORE_WEIGHTS, {
    clarity: 0.25,
    fluency: 0.2,
    grammar: 0.15,
    vocabulary: 0.15,
    structure: 0.15,
    conciseness: 0.1,
  });
  assert.equal(calculateSpeakingOverallScore(scores), 74);
  assert.equal(
    calculateSpeakingOverallScore({
      clarity: 100,
      fluency: 100,
      grammar: 100,
      vocabulary: 100,
      structure: 100,
      conciseness: 100,
    }),
    100,
  );
});

Deno.test("speaking weights mirror the database overall formula", () => {
  const expected = Math.round(
    scores.clarity * 0.25 +
      scores.fluency * 0.2 +
      scores.grammar * 0.15 +
      scores.vocabulary * 0.15 +
      scores.structure * 0.15 +
      scores.conciseness * 0.1,
  );
  assert.equal(calculateSpeakingOverallScore(scores), expected);
});

Deno.test("detects unusable speaking transcripts without rejecting I don't know", () => {
  assert.equal(isSpeakingTranscriptInsufficient("[music] um uh like"), true);
  assert.equal(isSpeakingTranscriptInsufficient(""), true);
  assert.equal(isSpeakingTranscriptInsufficient("I don't know."), false);
  assert.equal(isSpeakingTranscriptInsufficient("Um, actually, I am not sure yet."), false);
});

Deno.test("counts only deterministic speaking filler phrases", () => {
  assert.deepEqual(
    countSpeakingFillerWords("Um, like, you know, I mean it was, like, basically fine."),
    [
      { word: "um", count: 1 },
      { word: "like", count: 2 },
      { word: "you know", count: 1 },
      { word: "i mean", count: 1 },
      { word: "basically", count: 1 },
    ],
  );
  assert.deepEqual(countSpeakingFillerWords("A focused answer without fillers."), []);
});

const validSpeakingOutput = {
  scores,
  summary: "The answer is clear and well paced, with a couple of grammar slips.",
  strengths: [
    { title: "Clear structure", detail: "The start, body, and close were easy to follow." },
  ],
  improvements: [
    {
      title: "Filler density",
      detail: "Um appears several times at the start of sentences.",
      action: "Pause and breathe instead of saying um.",
    },
  ],
  grammarCorrections: [
    {
      original: "He go to the office yesterday.",
      corrected: "He went to the office yesterday.",
      explanation: "Past tense is needed with yesterday.",
    },
  ],
  naturalPhrasing: [
    {
      original: "The thing is that I feel like it is kind of important to me.",
      improved: "It is genuinely important to me.",
    },
  ],
  betterVersion:
    "I organized the migration weekend, and it finished ahead of schedule. The team communicated well, and the customer noticed the improvement.",
};

Deno.test("validates strict speaking output and score bounds", () => {
  assert.equal(validateSpeakingEvaluation(validSpeakingOutput).scores.clarity, 80);
  assert.throws(
    () =>
      validateSpeakingEvaluation({
        ...validSpeakingOutput,
        scores: { ...scores, fluency: 101 },
      }),
    SpeakingEvaluationValidationError,
  );
  assert.throws(
    () =>
      validateSpeakingEvaluation({
        ...validSpeakingOutput,
        naturalPhrasing: Array.from({ length: 6 }, () => validSpeakingOutput.naturalPhrasing[0]),
      }),
    SpeakingEvaluationValidationError,
  );
  assert.throws(
    () => validateSpeakingEvaluation({ ...validSpeakingOutput, betterVersion: "  " }),
    SpeakingEvaluationValidationError,
  );
});

Deno.test("rejects oversized narrative fields", () => {
  assert.throws(
    () =>
      validateSpeakingEvaluation({
        ...validSpeakingOutput,
        betterVersion: "word ".repeat(210).trim(),
      }),
    SpeakingEvaluationValidationError,
  );
});

Deno.test("normalizes text fields with NFKC whitespace collapsing", () => {
  const validated = validateSpeakingEvaluation({
    ...validSpeakingOutput,
    summary: "Two  sentences with   irregular spacing.",
  });
  assert.equal(validated.summary, "Two sentences with irregular spacing.");
});