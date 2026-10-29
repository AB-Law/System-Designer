import { AiSettings } from "./components/AiSettings";
import { ComparePage } from "./components/Compare";
import { History } from "./components/History";
import { Library } from "./components/Library";
import { ParseReview } from "./components/ParseReview";
import { Rewrites } from "./components/Rewrites";
import { ScoreForm } from "./components/ScoreForm";
import { ScoreResult } from "./components/ScoreResult";
import { Tabs } from "../../ui/Tabs";
import { go, parse, tabOf } from "./route";
import "./cv.css";

const TABS = [
  { id: "library", label: "My CVs" },
  { id: "score", label: "Score" },
  { id: "history", label: "History" },
  { id: "settings", label: "AI settings" },
];

export default function Screen({ rest }: { rest: string }) {
  const route = parse(rest);
  return (
    <div className="cv-module">
      <h1 className="cv-title">CV</h1>
      <p className="module-lede">Score your CV against a job description and close the gaps it shows.</p>
      <Tabs
        label="CV sections"
        tabs={TABS}
        active={tabOf(route)}
        onChange={(id) => go({ name: id as "library" | "score" | "history" | "settings" })}
      />
      <div className="cv-body">
        {route.name === "library" && <Library />}
        {route.name === "review" && <ParseReview key={route.cvId} cvId={route.cvId} />}
        {route.name === "score" && <ScoreForm key={route.targetId ?? "new"} targetId={route.targetId} />}
        {route.name === "result" && <ScoreResult key={route.runId} runId={route.runId} />}
        {route.name === "rewrites" && <Rewrites key={route.runId} runId={route.runId} />}
        {route.name === "history" && <History />}
        {route.name === "compare" && <ComparePage key={`${route.a}-${route.b}`} a={route.a} b={route.b} />}
        {route.name === "settings" && <AiSettings />}
      </div>
    </div>
  );
}
