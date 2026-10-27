import { ResumeValidationError, type ResumeMatchOutput, type ResumeAnalysisOutput } from "./resumeSchemas.ts";
import { MATCH_STATUSES, RESUME_SENIORITY_LEVELS } from "./resumeConfig.ts";

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ResumeValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new ResumeValidationError(`${label} contains unsupported fields`);
  }
}

function requireArray(value: unknown, label: string, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ResumeValidationError(`${label} must be an array`);
  }
  if (value.length > max) {
    throw new ResumeValidationError(`${label} exceeds ${max} items`);
  }
  return value as Record<string, unknown>[];
}

function requireEnum<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ResumeValidationError(`${label} is invalid`);
  }
  return value as T;
}

function requireText(value: unknown, label: string, maximumChars: number) {
  if (typeof value !== "string") {
    throw new ResumeValidationError(`${label} must be text`);
  }
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximumChars) {
    throw new ResumeValidationError(`${label} must be 1-${maximumChars} chars`);
  }
  return normalized;
}

function requireOptionalText(value: unknown, label: string, maximumChars: number) {
  if (value === null || value === undefined || value === "") return null;
  return requireText(value, label, maximumChars);
}

function requireInteger(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ResumeValidationError(`${label} must be an integer`);
  }
  if (value < min || value > max) {
    throw new ResumeValidationError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireIntegerOrNull(value: unknown, label: string, min: number, max: number) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ResumeValidationError(`${label} must be an integer or null`);
  }
  if (value < min || value > max) {
    throw new ResumeValidationError(`${label} must be between ${min} and ${max}`);
  }
  return value;
}

function requireNumberOrNull(value: unknown, label: string, min: number, max: number) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ResumeValidationError(`${label} must be a number or null`);
  }
  if (value < min || value > max) {
    throw new ResumeValidationError(`${label} must be between ${min} and ${max}`);
  }
  return Math.round(value * 2) / 2;
}

function requireSkillArray(value: unknown, label: string, max: number) {
  const arr = requireArray(value, label, max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `${label}[${index}]`);
    requireExactKeys(entry, ["name", "category", "evidence"], `${label}[${index}]`);
    return {
      name: requireText(entry.name, `${label}[${index}].name`, 120),
      category: requireText(entry.category, `${label}[${index}].category`, 80),
      evidence: requireText(entry.evidence, `${label}[${index}].evidence`, 800),
    };
  });
}

    function requireStringArray(
  value: unknown,
  label: string,
  max: number,
  maxItemChars: number,
) {
  const arr = requireArray(value, label, max);
  return arr.map((item, index) =>
    requireText(item, `${label}[${index}]`, maxItemChars)
  );
}

function requireWorkExperienceArray(value: unknown, max: number) {
  const arr = requireArray(value, "workExperience", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `workExperience[${index}]`);
    requireExactKeys(
      entry,
      ["role", "company", "startDate", "endDate", "summary", "responsibilities"],
      `workExperience[${index}]`,
    );
    return {
      role: requireOptionalText(entry.role, `workExperience[${index}].role`, 120),
      company: requireOptionalText(entry.company, `workExperience[${index}].company`, 120),
      startDate: requireOptionalText(entry.startDate, `workExperience[${index}].startDate`, 40),
      endDate: requireOptionalText(entry.endDate, `workExperience[${index}].endDate`, 40),
      summary: requireOptionalText(entry.summary, `workExperience[${index}].summary`, 400),
      responsibilities: requireStringArray(
        entry.responsibilities,
        `workExperience[${index}].responsibilities`,
        6,
        200,
      ),
    };
  });
}

function requireProjectArray(value: unknown, max: number) {
  const arr = requireArray(value, "projects", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `projects[${index}]`);
    requireExactKeys(entry, ["name", "description", "technologies"], `projects[${index}]`);
    return {
      name: requireText(entry.name, `projects[${index}].name`, 120),
      description: requireOptionalText(entry.description, `projects[${index}].description`, 600),
      technologies: requireStringArray(
        entry.technologies,
        `projects[${index}].technologies`,
        8,
        80,
      ),
    };
  });
}

function requireEducationArray(value: unknown, max: number) {
  const arr = requireArray(value, "education", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `education[${index}]`);
    requireExactKeys(entry, ["degree", "institution", "year"], `education[${index}]`);
    return {
      degree: requireOptionalText(entry.degree, `education[${index}].degree`, 120),
      institution: requireOptionalText(entry.institution, `education[${index}].institution`, 120),
      year: requireOptionalText(entry.year, `education[${index}].year`, 20),
    };
  });
}

function requireCertArray(value: unknown, max: number) {
  const arr = requireArray(value, "certifications", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `certifications[${index}]`);
    requireExactKeys(entry, ["name", "issuer", "year"], `certifications[${index}]`);
    return {
      name: requireText(entry.name, `certifications[${index}].name`, 160),
      issuer: requireOptionalText(entry.issuer, `certifications[${index}].issuer`, 120),
      year: requireOptionalText(entry.year, `certifications[${index}].year`, 20),
    };
  });
}

function requireMatchObjects(value: unknown, label: string, max: number) {
  const arr = requireArray(value, label, max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `${label}[${index}]`);
    requireExactKeys(entry, ["name", "evidence"], `${label}[${index}]`);
    return {
      name: requireText(entry.name, `${label}[${index}].name`, 120),
      evidence: requireText(entry.evidence, `${label}[${index}].evidence`, 400),
    };
  });
}

function requireRequirementMatches(value: unknown, max: number) {
  const arr = requireArray(value, "missingRequirements", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `missingRequirements[${index}]`);
    requireExactKeys(
      entry,
      ["requirement", "status", "evidence"],
      `missingRequirements[${index}]`,
    );
    return {
      requirement: requireText(entry.requirement, `missingRequirements[${index}].requirement`, 160),
      status: requireEnum(
        entry.status,
        `missingRequirements[${index}].status`,
        MATCH_STATUSES,
      ),
      evidence: requireOptionalText(entry.evidence, `missingRequirements[${index}].evidence`, 400),
    };
  });
}

function requireTransferableStrengths(value: unknown, max: number) {
  const arr = requireArray(value, "transferableStrengths", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `transferableStrengths[${index}]`);
    requireExactKeys(entry, ["strength", "evidence"], `transferableStrengths[${index}]`);
    return {
      strength: requireText(entry.strength, `transferableStrengths[${index}].strength`, 160),
      evidence: requireOptionalText(entry.evidence, `transferableStrengths[${index}].evidence`, 400),
    };
  });
}

function requireExperienceAlignments(value: unknown, max: number) {
  const arr = requireArray(value, "experienceAlignment", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `experienceAlignment[${index}]`);
    requireExactKeys(entry, ["requirement", "match", "evidence"], `experienceAlignment[${index}]`);
    return {
      requirement: requireText(entry.requirement, `experienceAlignment[${index}].requirement`, 160),
      match: requireEnum(entry.match, `experienceAlignment[${index}].match`, MATCH_STATUSES),
      evidence: requireOptionalText(entry.evidence, `experienceAlignment[${index}].evidence`, 400),
    };
  });
}

function requireInterviewRisks(value: unknown, max: number) {
  const arr = requireArray(value, "interviewRisks", max);
  return arr.map((item, index) => {
    const entry = requireObject(item, `interviewRisks[${index}]`);
    requireExactKeys(entry, ["risk", "preparation"], `interviewRisks[${index}]`);
    return {
      risk: requireText(entry.risk, `interviewRisks[${index}].risk`, 200),
      preparation: requireText(entry.preparation, `interviewRisks[${index}].preparation`, 400),
    };
  });
}

export function validateResumeAnalysis(value: unknown): ResumeAnalysisOutput {
  const object = requireObject(value, "resume analysis");
  requireExactKeys(
    object,
    [
      "professionalSummary",
      "currentOrLatestRole",
      "seniorityLevel",
      "yearsExperienceEstimate",
      "skills",
      "technologies",
      "workExperience",
      "projects",
      "education",
      "certifications",
      "strengths",
    ],
    "resume analysis",
  );
  return {
    professionalSummary: requireText(object.professionalSummary, "professionalSummary", 600),
    currentOrLatestRole: requireOptionalText(object.currentOrLatestRole, "currentOrLatestRole", 120),
    seniorityLevel: requireEnum(object.seniorityLevel, "seniorityLevel", RESUME_SENIORITY_LEVELS),
    yearsExperienceEstimate: requireNumberOrNull(
      object.yearsExperienceEstimate,
      "yearsExperienceEstimate",
      0,
      60,
    ),
    skills: requireSkillArray(object.skills, "skills", 12),
    technologies: requireStringArray(object.technologies, "technologies", 15, 80),
    workExperience: requireWorkExperienceArray(object.workExperience, 8),
    projects: requireProjectArray(object.projects, 8),
    education: requireEducationArray(object.education, 8),
    certifications: requireCertArray(object.certifications, 8),
    strengths: requireStringArray(object.strengths, "strengths", 8, 200),
  };
}

export function validateResumeMatch(value: unknown): ResumeMatchOutput {
  const object = requireObject(value, "resume match");
  requireExactKeys(
    object,
    [
      "overallMatchScore",
      "skillMatchScore",
      "experienceAlignmentScore",
      "matchingSkills",
      "missingRequirements",
      "transferableStrengths",
      "experienceAlignment",
      "interviewRisks",
      "recommendedFocusAreas",
      "summary",
    ],
    "resume match",
  );
  return {
    overallMatchScore: requireInteger(object.overallMatchScore, "overallMatchScore", 0, 100),
    skillMatchScore: requireIntegerOrNull(object.skillMatchScore, "skillMatchScore", 0, 100),
    experienceAlignmentScore: requireIntegerOrNull(
      object.experienceAlignmentScore,
      "experienceAlignmentScore",
      0,
      100,
    ),
    matchingSkills: requireMatchObjects(object.matchingSkills, "matchingSkills", 12),
    missingRequirements: requireRequirementMatches(object.missingRequirements, 15),
    transferableStrengths: requireTransferableStrengths(object.transferableStrengths, 8),
    experienceAlignment: requireExperienceAlignments(object.experienceAlignment, 12),
    interviewRisks: requireInterviewRisks(object.interviewRisks, 8),
    recommendedFocusAreas: requireStringArray(
      object.recommendedFocusAreas,
      "recommendedFocusAreas",
      8,
      120,
    ),
    summary: requireText(object.summary, "summary", 1000),
  };
}
