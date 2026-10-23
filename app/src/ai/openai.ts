/**
 * OpenAI Chat Completions request shaping.
 * Reasoning models (o-series, GPT-5/6) reject non-default temperature unless
 * reasoning_effort is "none". Safer default: omit sampling knobs for those models.
 */

export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
export const OPENAI_BASE = "https://api.openai.com/v1";

/** Models that run as reasoners by default and reject custom temperature/top_p. */
const REASONING_MODEL = /^(o[1-9]|gpt-5|gpt-6)([-.]|$)/i;

export function isReasoningModel(model: string | undefined | null): boolean {
  const m = (model ?? "").trim();
  return Boolean(m) && REASONING_MODEL.test(m);
}

export type ChatMessage = { role: string; content: string };

export type CompletionsBodyOpts = {
  model?: string;
  messages: ChatMessage[];
  /** Only applied when the model allows sampling controls. */
  temperature?: number;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
};

/**
 * Build a /v1/chat/completions JSON body that will not 400 on gpt-6-luna et al.
 * Omits temperature (and never sends top_p) when the model is a reasoner and
 * effort is not explicitly "none".
 */
export function buildCompletionsBody(opts: CompletionsBodyOpts): Record<string, unknown> {
  const model = opts.model?.trim() || undefined;
  const body: Record<string, unknown> = { messages: opts.messages };
  if (model) body.model = model;
  if (opts.reasoningEffort) body.reasoning_effort = opts.reasoningEffort;

  const allowSampling = !isReasoningModel(model) || opts.reasoningEffort === "none";
  if (allowSampling && opts.temperature !== undefined) body.temperature = opts.temperature;
  return body;
}
