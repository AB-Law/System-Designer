import { Suspense, lazy, useEffect } from "react";
import { useStore } from "./store";
import { TopBar } from "./components/TopBar";
import { HomeScreen } from "./components/home/HomeScreen";
import { Landing } from "./components/home/Landing";
import { AuthModal } from "./components/modals/AuthModal";
import { TourLayer } from "./components/tour/TourLayer";
import { backend } from "./api";
import { hubOn } from "./shell/hub";
import { ModuleHost } from "./shell/ModuleHost";
import { useActiveModule } from "./shell/useActiveModule";

// The canvas, its panels and the secondary screens load on demand, so the landing page and the other modules do not pay for them.
const named = <T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const LeftPanel = named(() => import("./components/canvas/LeftPanel"), "LeftPanel");
const CanvasView = named(() => import("./components/canvas/CanvasView"), "CanvasView");
const RightPanel = named(() => import("./components/canvas/RightPanel"), "RightPanel");
const RunModal = named(() => import("./components/modals/RunModal"), "RunModal");
const AiSettingsModal = named(() => import("./components/modals/AiSettingsModal"), "AiSettingsModal");
const RoadmapScreen = named(() => import("./components/roadmap/RoadmapScreen"), "RoadmapScreen");
const PrimerPanel = named(() => import("./components/roadmap/PrimerPanel"), "PrimerPanel");
const CelebrateCard = named(() => import("./components/roadmap/CelebrateCard"), "CelebrateCard");
const LearnScreen = named(() => import("./components/learn/LearnScreen"), "LearnScreen");
const SharedView = named(() => import("./components/share/SharedView"), "SharedView");
const ShareModal = named(() => import("./components/modals/ShareModal"), "ShareModal");
const CompareModal = named(() => import("./components/modals/CompareModal"), "CompareModal");

export function App() {
  const init = useStore((s) => s.init);
  const runOpen = useStore((s) => s.runOpen);
  const aiOpen = useStore((s) => s.aiOpen);
  const authOpen = useStore((s) => s.authOpen);
  const shareOpen = useStore((s) => s.shareOpen);
  const compareOpen = useStore((s) => s.compareOpen);
  const view = useStore((s) => s.view);
  const celebrate = useStore((s) => s.celebrate);
  const primerOpen = useStore((s) => s.primerOpen);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const copySelection = useStore((s) => s.copySelection);
  const paste = useStore((s) => s.paste);
  const duplicate = useStore((s) => s.duplicate);
  const selectAll = useStore((s) => s.selectAll);
  const booted = useStore((s) => s.booted);
  const activeModule = useActiveModule();
  const user = useStore((s) => s.user);
  const landingSeen = useStore((s) => s.landingSeen);
  useStore((s) => s.problems); // loading problems is what sets backend.online
  const showLanding = hubOn() && backend.online && !user && !landingSeen && view === "home";

  useEffect(() => {
    void init();
  }, [init]);

  // The tab title names the page the visitor is on; the static head carries the default.
  const heading = activeModule
    ? activeModule.module.title
    : ({
        home: "System design practice",
        learn: "Learn",
        roadmap: "Learning roadmap",
        shared: "Shared design",
        canvas: "System design simulator",
      }[view] ?? "");
  useEffect(() => {
    document.title = heading ? `${heading} | Design Canvas` : "Design Canvas";
  }, [heading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "c") copySelection();
        else if (k === "v") paste();
        else if (k === "d") {
          e.preventDefault();
          duplicate();
        } else if (k === "a") {
          e.preventDefault();
          selectAll();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, copySelection, paste, duplicate, selectAll]);

  // Until the session and problems are read, show the bar and nothing else: no "standalone" pill, zero counts or raw ids that then jump.
  if (!booted) {
    return (
      <div className="app">
        <header className="topbar topbar-page">
          <span className="brand">Design Canvas</span>
        </header>
        <main className="app-boot" aria-busy="true" aria-label="Loading" />
      </div>
    );
  }

  if (activeModule) {
    return (
      <div className="app">
        <TopBar />
        <ModuleHost module={activeModule.module} rest={activeModule.rest} />
        {authOpen && <AuthModal />}
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <Suspense fallback={null}>
        {view === "home" ? (
          showLanding ? (
            <Landing />
          ) : (
            <HomeScreen />
          )
        ) : view === "shared" ? (
          <SharedView />
        ) : view === "learn" ? (
          <LearnScreen />
        ) : view === "roadmap" ? (
          <RoadmapScreen />
        ) : (
          <div className="main">
            <p className="small-screen-note" role="note">
              <b>Best on a larger screen.</b> You can read the brief and scores here, but dragging and connecting blocks works best on a
              laptop or tablet.
            </p>
            <LeftPanel />
            <CanvasView />
            <RightPanel />
          </div>
        )}
        {view === "canvas" && celebrate && <CelebrateCard />}
        {primerOpen && <PrimerPanel />}
        {runOpen && <RunModal />}
        {aiOpen && <AiSettingsModal />}
        {authOpen && <AuthModal />}
        {shareOpen && <ShareModal />}
        {compareOpen && <CompareModal />}
      </Suspense>
      <TourLayer />
    </div>
  );
}
