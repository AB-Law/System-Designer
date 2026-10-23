export type { GlossaryEntry, RoadmapPrefs, RoadmapStage, RoadmapStep, StepProgress, StepStatus } from "./types";
export { ROADMAP, TOTAL_STEPS, allSteps, findStep } from "./roadmap";
export { GLOSSARY, lookupTerm } from "./glossary";
export {
  ROADMAP_LS_KEY,
  bestScore,
  continueTarget,
  countDone,
  earlierIncomplete,
  firstNotDone,
  isStepDone,
  loadRoadmapPrefs,
  saveRoadmapPrefs,
  markPrimerRead,
  localSubmissions,
  stageDoneCount,
  statusFor,
  stepProgress,
} from "./progress";
export { checkRoadmap, validateRoadmap } from "./validate";
export type { RoadmapIssue } from "./validate";
