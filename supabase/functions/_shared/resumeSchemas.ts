import {
  MATCH_STATUSES,
  RESUME_SENIORITY_LEVELS,
  type MatchStatus,
  type ResumeSeniority,
} from "./resumeConfig.ts";

export type { MatchStatus };

export type ResumeSkill = {
  name: string;
  category: string;
  evidence: string;
};

export type ResumeWorkExperience = {
  role: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  responsibilities: string[];
};

export type ResumeProject = {
  name: string;
  description: string | null;
  technologies: string[];
};

export type ResumeEducation = {
  degree: string | null;
  institution: string | null;
  year: string | null;
};

export type ResumeCertification = {
  name: string;
  issuer: string | null;
  year: string | null;
};

export type ResumeAnalysisOutput = {
  professionalSummary: string;
  currentOrLatestRole: string | null;
  seniorityLevel: ResumeSeniority;
  yearsExperienceEstimate: number | null;
  skills: ResumeSkill[];
  technologies: string[];
  workExperience: ResumeWorkExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  strengths: string[];
};

export class ResumeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeValidationError";
  }
}

export type RequirementMatch = {
  requirement: string;
  status: MatchStatus;
  evidence: string | null;
};

export type ResumeMatchOutput = {
  overallMatchScore: number;
  skillMatchScore: number | null;
  experienceAlignmentScore: number | null;
  matchingSkills: { name: string; evidence: string }[];
  missingRequirements: RequirementMatch[];
  transferableStrengths: { strength: string; evidence: string | null }[];
  experienceAlignment: {
    requirement: string;
    match: MatchStatus;
    evidence: string | null;
  }[];
  interviewRisks: { risk: string; preparation: string }[];
  recommendedFocusAreas: string[];
  summary: string;
};

export const RESUME_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    professionalSummary: { type: "string", minLength: 1, maxLength: 600 },
    currentOrLatestRole: { type: ["string", "null"], maxLength: 120 },
    seniorityLevel: { type: "string", enum: [...RESUME_SENIORITY_LEVELS] },
    yearsExperienceEstimate: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 60,
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          category: { type: "string", minLength: 1, maxLength: 80 },
          evidence: { type: "string", minLength: 1, maxLength: 800 },
        },
        required: ["name", "category", "evidence"],
        additionalProperties: false,
      },
      maxItems: 12,
    },
    technologies: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 80 },
      maxItems: 15,
    },
    workExperience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: ["string", "null"], maxLength: 120 },
          company: { type: ["string", "null"], maxLength: 120 },
          startDate: { type: ["string", "null"], maxLength: 40 },
          endDate: { type: ["string", "null"], maxLength: 40 },
          summary: { type: ["string", "null"], maxLength: 400 },
          responsibilities: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 200 },
            maxItems: 6,
          },
        },
        required: ["role", "company", "startDate", "endDate", "summary", "responsibilities"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: ["string", "null"], maxLength: 600 },
          technologies: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 80 },
            maxItems: 8,
          },
        },
        required: ["name", "description", "technologies"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degree: { type: ["string", "null"], maxLength: 120 },
          institution: { type: ["string", "null"], maxLength: 120 },
          year: { type: ["string", "null"], maxLength: 20 },
        },
        required: ["degree", "institution", "year"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 160 },
          issuer: { type: ["string", "null"], maxLength: 120 },
          year: { type: ["string", "null"], maxLength: 20 },
        },
        required: ["name", "issuer", "year"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    strengths: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 200 },
      maxItems: 8,
    },
  },
  required: [
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
  additionalProperties: false,
} as const;

export const RESUME_MATCH_JSON_SCHEMA = {
  type: "object",
  properties: {
    overallMatchScore: { type: "integer", minimum: 0, maximum: 100 },
    skillMatchScore: { type: ["integer", "null"], minimum: 0, maximum: 100 },
    experienceAlignmentScore: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 100,
    },
    matchingSkills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          evidence: { type: "string", minLength: 1, maxLength: 400 },
        },
        required: ["name", "evidence"],
        additionalProperties: false,
      },
      maxItems: 12,
    },
    missingRequirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string", minLength: 1, maxLength: 160 },
          status: { type: "string", enum: [...MATCH_STATUSES] },
          evidence: { type: ["string", "null"], maxLength: 400 },
        },
        required: ["requirement", "status", "evidence"],
        additionalProperties: false,
      },
      maxItems: 15,
    },
    transferableStrengths: {
      type: "array",
      items: {
        type: "object",
        properties: {
          strength: { type: "string", minLength: 1, maxLength: 160 },
          evidence: { type: ["string", "null"], maxLength: 400 },
        },
        required: ["strength", "evidence"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    experienceAlignment: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string", minLength: 1, maxLength: 160 },
          match: { type: "string", enum: [...MATCH_STATUSES] },
          evidence: { type: ["string", "null"], maxLength: 400 },
        },
        required: ["requirement", "match", "evidence"],
        additionalProperties: false,
      },
      maxItems: 12,
    },
    interviewRisks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          risk: { type: "string", minLength: 1, maxLength: 200 },
          preparation: { type: "string", minLength: 1, maxLength: 400 },
        },
        required: ["risk", "preparation"],
        additionalProperties: false,
      },
      maxItems: 8,
    },
    recommendedFocusAreas: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 120 },
      maxItems: 8,
    },
    summary: { type: "string", minLength: 1, maxLength: 1000 },
  },
  required: [
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
  additionalProperties: false,
} as const;
