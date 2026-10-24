// Back-of-envelope sizing: the questions an interviewer asks first, with answers worked out from the problem's own traffic numbers.
import type { Problem } from "../types";

/** What an app server handles when nothing is shared or cached (the Server block's default). */
export const SERVER_RPS = 1000;

export interface EstimateQuestion {
  id: string;
  prompt: string;
  unit: string;
  answer: number;
  /** how the answer is worked out, in plain words with the numbers filled in */
  working: string;
}

const n = (v: number) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString();

export function estimateQuestions(p: Problem): EstimateQuestion[] {
  const { users, reqPerUser, writeShare } = p.traffic;
  const rps = users * reqPerUser;
  const busiest = p.scenarios.reduce((a, s) => (s.trafficMultiplier > a.trafficMultiplier ? s : a), p.scenarios[0]);
  const out: EstimateQuestion[] = [
    {
      id: "rps",
      prompt: "How many requests per second reach the system at a normal peak?",
      unit: "requests per second",
      answer: rps,
      working: `${n(users)} users × ${reqPerUser} requests each per second = ${n(rps)} per second.`,
    },
    {
      id: "writes",
      prompt: "How many of those are writes (the rest are reads)?",
      unit: "writes per second",
      answer: rps * writeShare,
      working: `${Math.round(writeShare * 100)}% of ${n(rps)} = ${n(rps * writeShare)} writes per second, and ${n(rps * (1 - writeShare))} reads.`,
    },
  ];
  const spiky = busiest && busiest.trafficMultiplier > 1;
  if (spiky) {
    out.push({
      id: "spike",
      prompt: `In "${busiest.title}", traffic is ${busiest.trafficMultiplier} times higher. How many requests per second is that?`,
      unit: "requests per second",
      answer: rps * busiest.trafficMultiplier,
      working: `${busiest.trafficMultiplier} × ${n(rps)} = ${n(rps * busiest.trafficMultiplier)} per second.`,
    });
  }
  const peak = rps * (spiky ? busiest.trafficMultiplier : 1);
  const servers = Math.max(1, Math.ceil(peak / SERVER_RPS));
  out.push({
    id: "servers",
    prompt: `If every request had to be handled by an app server that manages about ${SERVER_RPS.toLocaleString()} requests per second, how many servers would the busiest moment need?`,
    unit: "servers",
    answer: servers,
    working: `${n(peak)} ÷ ${SERVER_RPS.toLocaleString()} = ${n(peak / SERVER_RPS)}${Number.isInteger(peak / SERVER_RPS) ? "" : `, rounded up to ${servers}`}. A cache or a CDN in front takes much of this away, so a real design needs fewer.`,
  });
  return out;
}

/** "4k", "4,000", "1.5m", "2 000": a number, or null when the text is not one. */
export function parseAmount(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .replace(/[,\s_]/g, "")
    .match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const mult = m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : m[2] === "b" ? 1e9 : 1;
  return Number(m[1]) * mult;
}

export type Grade = { level: "right" | "close" | "off"; text: string };

/** Within 25% is right, within a factor of three is close (the right order of magnitude), anything else is off. */
export function gradeEstimate(guess: number, answer: number): Grade {
  if (answer <= 0) return { level: guess === 0 ? "right" : "off", text: guess === 0 ? "Right." : "It is zero." };
  const r = guess / answer;
  if (r >= 0.75 && r <= 1.25) return { level: "right", text: "Right on the money." };
  if (r >= 1 / 3 && r <= 3) return { level: "close", text: r > 1 ? "Close, a little high." : "Close, a little low." };
  const f = r > 1 ? r : 1 / r;
  return {
    level: "off",
    text: `Off by about ${f >= 10 ? Math.round(f).toLocaleString() : f.toFixed(1)} times, ${r > 1 ? "too high" : "too low"}.`,
  };
}
