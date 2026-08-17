import { describe, expect, it } from "vitest";

import {
  FEATURE_KEYS,
  FEATURE_LIMIT_CODE,
  PLAN_LABELS,
  PRO_REQUIRED_CODE,
  formatLimit,
  formatPeriod,
  isMonetizationErrorCode,
} from "../features";

describe("formatLimit", () => {
  it("labels the AI feedback limit as per day", () => {
    expect(formatLimit(FEATURE_KEYS.aiFeedback, 5)).toBe("5 per day");
  });

  it("labels monthly features as per month", () => {
    expect(formatLimit(FEATURE_KEYS.jobAnalysis, 2)).toBe("2 per month");
    expect(formatLimit(FEATURE_KEYS.resumeAnalysis, 1)).toBe("1 per month");
    expect(formatLimit(FEATURE_KEYS.personalizedInterview, 1)).toBe("1 per month");
  });

  it("treats a null limit as unlimited", () => {
    expect(formatLimit(FEATURE_KEYS.deepInterview, null)).toBe("Unlimited");
    expect(formatLimit(FEATURE_KEYS.aiFeedback, undefined as never)).toBe("Unlimited");
  });
});

describe("formatPeriod", () => {
  it("maps ai_feedback to a daily window", () => {
    expect(formatPeriod(FEATURE_KEYS.aiFeedback)).toBe("day");
  });

  it("maps the monthly features to a monthly window", () => {
    expect(formatPeriod(FEATURE_KEYS.jobAnalysis)).toBe("month");
    expect(formatPeriod(FEATURE_KEYS.resumeAnalysis)).toBe("month");
    expect(formatPeriod(FEATURE_KEYS.personalizedInterview)).toBe("month");
  });

  it("returns null for pro-only features with no window", () => {
    expect(formatPeriod(FEATURE_KEYS.deepInterview)).toBeNull();
    expect(formatPeriod(FEATURE_KEYS.fullHistory)).toBeNull();
  });
});

describe("monetization error codes", () => {
  it("recognizes both blocking codes", () => {
    expect(isMonetizationErrorCode(PRO_REQUIRED_CODE)).toBe(true);
    expect(isMonetizationErrorCode(FEATURE_LIMIT_CODE)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMonetizationErrorCode("network_error")).toBe(false);
    expect(isMonetizationErrorCode(null)).toBe(false);
    expect(isMonetizationErrorCode(undefined)).toBe(false);
  });
});

describe("plan labels", () => {
  it("exposes a label for every plan", () => {
    expect(PLAN_LABELS.free).toBe("Free");
    expect(PLAN_LABELS.pro).toBe("Vocara Pro");
  });
});
