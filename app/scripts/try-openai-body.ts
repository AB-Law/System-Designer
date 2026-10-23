// Unit-check Chat Completions body shaping for gpt-6-luna (no live key needed).
import { buildCompletionsBody, isReasoningModel, DEFAULT_OPENAI_MODEL } from "../src/ai/openai";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) fails++;
};

check("default model id", DEFAULT_OPENAI_MODEL === "gpt-6-luna");
check("gpt-6-luna is a reasoner", isReasoningModel("gpt-6-luna"));
check("gpt-4o-mini is not", !isReasoningModel("gpt-4o-mini"));

const luna = buildCompletionsBody({
  model: "gpt-6-luna",
  messages: [{ role: "user", content: "hi" }],
  temperature: 0.2,
});
check("luna omits temperature", !("temperature" in luna), JSON.stringify(luna));
check("luna keeps messages", Array.isArray(luna.messages));

const lunaNone = buildCompletionsBody({
  model: "gpt-6-luna",
  messages: [{ role: "user", content: "hi" }],
  temperature: 0.2,
  reasoningEffort: "none",
});
check("luna + effort none keeps temperature", lunaNone.temperature === 0.2);

const mini = buildCompletionsBody({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }],
  temperature: 0.2,
});
check("gpt-4o-mini keeps temperature", mini.temperature === 0.2);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
