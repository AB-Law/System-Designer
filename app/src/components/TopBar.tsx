import { useState } from "react";
import { backend } from "../api";
import { money } from "../blocks";
import { useRun } from "../hooks";
import { useStore } from "../store";
import { ModuleSwitcher } from "../shell/ModuleSwitcher";
import { goHub, hubOn } from "../shell/hub";
import { goModule } from "../shell/route";
import { DESIGN } from "../shell/registry";
import { useActiveModule, useModules } from "../shell/useActiveModule";

export function TopBar() {
  const problems = useStore((s) => s.problems);
  const problemId = useStore((s) => s.problemId);
  const setProblem = useStore((s) => s.setProblem);
  const setRunOpen = useStore((s) => s.setRunOpen);
  const setRightTab = useStore((s) => s.setRightTab);
  const submit = useStore((s) => s.submit);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const ai = useStore((s) => s.ai);
  const user = useStore((s) => s.user);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const signOut = useStore((s) => s.signOut);
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  const modules = useModules();
  const inDesign = useActiveModule() === null; // the problem picker, cost chip and review buttons belong to Design only
  const [menu, setMenu] = useState(false);
  const workbench = inDesign && (view === "canvas" || view === "roadmap");
  const run = useRun();
  const over = run?.budget !== undefined && run.cost > run.budget;

  const groups = (["easy", "medium", "hard"] as const).map((d) => ({ d, items: problems.filter((p) => p.difficulty === d) }));

  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        onClick={() => {
          if (hubOn() && user) return goHub();
          if (hubOn()) setLandingSeen(false);
          goModule(DESIGN, modules);
          setView("home");
        }}
        title="Home"
      >
        Design Canvas
      </button>
      <ModuleSwitcher />
      {workbench ? (
        <div className="problem-pick">
          <select value={problemId} onChange={(e) => void setProblem(e.target.value)} aria-label="Problem">
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <optgroup key={g.d} label={g.d.toUpperCase()}>
                    {g.items.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </select>
        </div>
      ) : (
        <div className="problem-pick" />
      )}
      <div className="actions">
        {workbench && run && run.budget !== undefined && (
          <span className={"cost-chip" + (over ? " over" : "")} title="Estimated monthly infrastructure cost against this problem's budget">
            {money(run.cost)} <i>/ {money(run.budget)} mo</i>
          </span>
        )}
        {!backend.online && (
          <span className="pill" title="Running standalone (static problems, browser storage)">
            standalone
          </span>
        )}
        {backend.online &&
          (user ? (
            <div className="acct">
              <button className="btn ghost" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} title="Your account">
                {user.username} ▾
              </button>
              {menu && (
                <div className="acct-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                  <button role="menuitem" onClick={() => (setMenu(false), setView("home"))}>
                    Home: links and cohorts
                  </button>
                  <button role="menuitem" onClick={() => (setMenu(false), void signOut())}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : view === "home" ? null : (
            <button className="btn ghost tall" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          ))}
        {inDesign && (
          <button
            type="button"
            className={"btn tall" + (view === "roadmap" ? " primary" : " ghost")}
            onClick={() => setView(view === "roadmap" ? "canvas" : "roadmap")}
            aria-pressed={view === "roadmap"}
          >
            {view === "roadmap" ? "Canvas" : "Roadmap"}
          </button>
        )}
        {workbench && (
          <>
            <button
              className="btn ghost tall"
              onClick={() => setAiOpen(true)}
              title={`AI coach settings. Provider: ${ai.provider === "off" ? "off" : ai.provider === "lmstudio" ? "LM Studio (local)" : "OpenAI"}`}
            >
              AI coach{ai.provider === "off" ? ": off" : ""}
            </button>
            <div className="btn-group" role="group" aria-label="Check your design">
              <button
                className="btn tall"
                onClick={() => setRightTab("simulate")}
                title="Watch how each scenario's traffic flows through your design and where it breaks"
              >
                Simulate
              </button>
              <button
                className="btn tall primary"
                onClick={() => setRunOpen(true)}
                title="Score your design now. The score is not saved; a snapshot of your canvas is kept in Versions. Submit to save the score."
              >
                Preview score
              </button>
              <button
                className="btn tall success"
                onClick={() => void submit()}
                title="Save this attempt: its score and canvas go to Submissions and your progress"
              >
                Submit
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
