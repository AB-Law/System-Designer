import type { ReactNode } from "react";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { ScoreRing } from "../ui/ScoreRing";
import { DESIGN } from "./registry";
import { goModule } from "./route";
import type { ModuleDef } from "./types";
import { useModules } from "./useActiveModule";
import "./gate.css";

interface Pitch {
  headline: string;
  points: string[];
  sample: ReactNode;
}

/** What each module gives you, with a small made-up sample of its screen. The samples are marked as samples and never use real data. */
const PITCH: Record<string, Pitch> = {
  cv: {
    headline: "See how your CV scores against a job",
    points: ["Score it against any job description", "See exactly which requirements are missing", "Get rewrites that close the gaps"],
    sample: (
      <div className="gate-row">
        <ScoreRing value={82} size={92} label="Sample match" />
        <div className="gate-chips">
          <span className="ok">✓ Distributed systems</span>
          <span className="ok">✓ PostgreSQL</span>
          <span className="no">✕ Kubernetes</span>
          <span className="no">✕ Team leadership</span>
        </div>
      </div>
    ),
  },
  interview: {
    headline: "Practise the interview out loud",
    points: ["Mock interviews in character for your role", "Feedback on every answer", "Watch your score climb"],
    sample: (
      <div className="gate-row">
        <div className="gate-chat">
          <span>How would you scale this to 10x traffic?</span>
          <span className="me">Cache reads, then shard the database.</span>
        </div>
        <ScoreRing value={72} size={80} label="Sample score" />
      </div>
    ),
  },
  study: {
    headline: "Remember what you learn",
    points: ["Flashcards with spaced repetition", "Mind maps for the concepts that stick", "Cards built from your own gaps"],
    sample: (
      <div className="gate-card">
        <small>Question</small>
        <strong>What does CAP theorem say?</strong>
      </div>
    ),
  },
  hub: {
    headline: "Know exactly how ready you are",
    points: ["One readiness score for your target role", "A ranked next move, every day", "A countdown to your interview date"],
    sample: (
      <div className="gate-row">
        <ScoreRing value={68} size={104} label="Sample readiness" />
        <div className="gate-chips">
          <span>Interview in 12 days</span>
          <span>2 day streak</span>
        </div>
      </div>
    ),
  },
};

const FALLBACK: Pitch = {
  headline: "Sign in to continue",
  points: ["Your work is saved to your account", "It follows you across devices", "Only you can see it"],
  sample: null,
};

/** Shown to a visitor who is not signed in when they open a module that keeps data on the server. */
export function SignInGate({ module }: { module: ModuleDef }) {
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const modules = useModules();
  const pitch = PITCH[module.id] ?? FALLBACK;

  return (
    <section className="gate" aria-labelledby="gate-title">
      <div className="gate-copy">
        <p className="gate-kicker">{module.title}</p>
        <h2 id="gate-title">{pitch.headline}</h2>
        <ul>
          {pitch.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="gate-cta">
          <Button variant="primary" onClick={() => setAuthOpen(true)}>
            Sign in or create an account
          </Button>
          <Button onClick={() => goModule(DESIGN, modules)}>Try the Design Canvas as a guest</Button>
        </div>
        <p className="gate-note">
          Sign-up is invite-only. Your {/^[A-Z]{2,}$/.test(module.title) ? module.title : module.title.toLowerCase()} data stays private to
          your account.
        </p>
      </div>
      {pitch.sample && (
        <div className="gate-sample" aria-hidden="true">
          <span className="gate-tag">Sample</span>
          {pitch.sample}
        </div>
      )}
    </section>
  );
}
