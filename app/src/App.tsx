import { useEffect } from "react";
import { useStore } from "./store";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/canvas/LeftPanel";
import { CanvasView } from "./components/canvas/CanvasView";
import { RightPanel } from "./components/canvas/RightPanel";
import { RunModal } from "./components/modals/RunModal";
import { AiSettingsModal } from "./components/modals/AiSettingsModal";
import { RoadmapScreen } from "./components/roadmap/RoadmapScreen";
import { PrimerPanel } from "./components/roadmap/PrimerPanel";
import { CelebrateCard } from "./components/roadmap/CelebrateCard";
import { LearnScreen } from "./components/learn/LearnScreen";
import { HomeScreen } from "./components/home/HomeScreen";
import { SharedView } from "./components/share/SharedView";
import { AuthModal } from "./components/modals/AuthModal";
import { ShareModal } from "./components/modals/ShareModal";
import { CompareModal } from "./components/modals/CompareModal";
import { TourLayer } from "./components/tour/TourLayer";

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

  useEffect(() => {
    void init();
  }, [init]);

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

  return (
    <div className="app">
      <TopBar />
      {view === "home" ? (
        <HomeScreen />
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
      <TourLayer />
    </div>
  );
}
