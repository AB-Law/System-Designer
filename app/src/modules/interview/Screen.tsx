import { Tabs } from "../../ui/Tabs";
import { Docs } from "./components/Docs";
import { SessionPage } from "./components/SessionPage";
import { Sessions } from "./components/Sessions";
import { Setup } from "./components/Setup";
import { go, parse, tabOf } from "./route";
import "./interview.css";

const TABS = [
  { id: "sessions", label: "My interviews" },
  { id: "new", label: "New interview" },
  { id: "docs", label: "Documents" },
];

export default function Screen({ rest }: { rest: string }) {
  const route = parse(rest);
  return (
    <div className="iv-module">
      <h1 className="iv-title">Interview</h1>
      <p className="module-lede">Mock interviews for a role, run in character, with feedback on every answer.</p>
      <Tabs
        label="Interview sections"
        tabs={TABS}
        active={tabOf(route)}
        onChange={(id) => go(id === "new" ? { name: "new", roleId: null } : id === "docs" ? { name: "docs" } : { name: "sessions" })}
      />
      <div className="iv-body">
        {route.name === "sessions" && <Sessions />}
        {route.name === "new" && (
          <Setup key={`${route.roleId ?? "new"}-${route.scoreRunId ?? ""}`} roleId={route.roleId} scoreRunId={route.scoreRunId} />
        )}
        {route.name === "session" && <SessionPage key={route.sessionId} sessionId={route.sessionId} />}
        {route.name === "docs" && <Docs />}
      </div>
    </div>
  );
}
