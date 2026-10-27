import { strict as assert } from "node:assert";

import {
  aggregateCategoryScores,
  calculateOverallScore,
  countFillerWords,
  isTranscriptInsufficient,
  performanceLabel,
  selectAnswerExtremes,
  type CategoryScores,
} from "../_shared/evaluationConfig.ts";
import {
  EvaluationValidationError,
  validateAnswerEvaluation,
  validateSessionEvaluation,
} from "../_shared/evaluationSchemas.ts";
import {
  EvaluationFunctionError,
  isRetryableGroqError,
  withGroqRetry,
} from "../_shared/groq.ts";
import { EVALUATION_FIXTURES } from "./evaluationFixtures.ts";

Deno.test("interview requests do not silently repeat a timed-out Groq call", async () => {
  let calls = 0;
  await assert.rejects(() => withGroqRetry(async () => {
    calls++;
    throw new EvaluationFunctionError(504, "GROQ_TIMEOUT", "Mock timeout");
  }, { maxAttempts: 1 }), /Mock timeout/);
  assert.equal(calls, 1);
});

const scores: CategoryScores = {
  relevance: 80,
  structure: 70,
  clarity: 90,
  grammar: 100,
  vocabulary: 60,
  confidence: 50,
};

Deno.test("calculates the documented weighted answer score", () => {
  assert.equal(calculateOverallScore(scores), 76);
  assert.equal(
    calculateOverallScore({
      relevance: 100,
      structure: 100,
      clarity: 100,
      grammar: 100,
      vocabulary: 100,
      confidence: 100,
    }),
    100,
  );
});

Deno.test("averages session categories and selects deterministic extremes", () => {
  const answers = [
    { answerId: "later", questionNumber: 2, overallScore: 80, scores },
    { answerId: "earlier", questionNumber: 1, overallScore: 80, scores },
    {
      answerId: "focus",
      questionNumber: 3,
      overallScore: 45,
      scores: { ...scores, relevance: 40 },
    },
  ];
  assert.equal(aggregateCategoryScores(answers)?.relevance, 67);
  assert.deepEqual(selectAnswerExtremes(answers), {
    strongestAnswerId: "earlier",
    focusAnswerId: "focus",
  });
});

Deno.test("uses stable encouraging performance labels", () => {
  assert.equal(performanceLabel(90), "Excellent interview");
  assert.equal(performanceLabel(80), "Strong interview");
  assert.equal(performanceLabel(70), "Good interview");
  assert.equal(performanceLabel(60), "Developing");
  assert.equal(performanceLabel(59), "Needs more practice");
});

Deno.test("detects unusable transcripts without rejecting I don't know", () => {
  assert.equal(isTranscriptInsufficient("[music] um uh"), true);
  assert.equal(isTranscriptInsufficient(""), true);
  assert.equal(isTranscriptInsufficient("I don't know."), false);
});

Deno.test("counts only deterministic filler phrases", () => {
  assert.deepEqual(countFillerWords("Um, I mean, it was kind of useful, um."), [
    { word: "i mean", count: 1 },
    { word: "kind of", count: 1 },
    { word: "um", count: 2 },
  ]);
});

Deno.test("validates strict answer output and score bounds", () => {
  const valid = {
    scores,
    summary: "The answer is relevant and clear, but the sequence can be tighter.",
    strengths: [{ title: "Relevant example", detail: "The example directly supports the question." }],
    improvements: [
      {
        title: "Tighten the sequence",
        detail: "The middle lists actions without a clear order.",
        action: "Present the investigation in two chronological steps.",
      },
    ],
    betterApproach: "Open with the problem, explain two actions, and close with the real result.",
    improvedAnswer: "I first confirmed the issue, then traced the request through the logs and fixed the retry behavior.",
  };
  assert.equal(validateAnswerEvaluation(valid).scores.clarity, 90);
  assert.throws(
    () => validateAnswerEvaluation({ ...valid, scores: { ...scores, clarity: 101 } }),
    EvaluationValidationError,
  );
  assert.throws(
    () => validateAnswerEvaluation({
      ...valid,
      strengths: [
        ...valid.strengths,
        ...valid.strengths,
        ...valid.strengths,
        ...valid.strengths,
      ],
    }),
    EvaluationValidationError,
  );
});

Deno.test("validates the recommendation enum", () => {
  const valid = {
    summary: "The interview stayed relevant, with structure as the clearest next focus.",
    strengths: [{ title: "Relevance", detail: "Most answers addressed their questions directly." }],
    focusAreas: [
      {
        title: "Results",
        detail: "Several answers ended before describing the outcome.",
        action: "Close each example with the truthful outcome or lesson.",
      },
    ],
    recommendedPractice: { type: "behavioral", reason: "Practice concise context-action-result answers." },
  };
  assert.equal(validateSessionEvaluation(valid).recommendedPractice.type, "behavioral");
  assert.throws(
    () => validateSessionEvaluation({ ...valid, recommendedPractice: { ...valid.recommendedPractice, type: "/admin" } }),
    EvaluationValidationError,
  );
});

Deno.test("includes all required quality fixtures", () => {
  assert.deepEqual(
    EVALUATION_FIXTURES.map((fixture) => fixture.id),
    ["strong", "rambling", "off-topic", "short", "grammar", "prompt-injection", "clear-non-native"],
  );
});

Deno.test("retries transient Groq structured-output failures", async () => {
  const failure = new EvaluationFunctionError(
    502,
    "GROQ_INVALID_REQUEST",
    "Structured output generation failed.",
  );
  assert.equal(isRetryableGroqError(failure), true);

  const attempts: number[] = [];
  const result = await withGroqRetry(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 3) throw failure;
    return "completed";
  });

  assert.equal(result, "completed");
  assert.deepEqual(attempts, [1, 2, 3]);
});
