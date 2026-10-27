/**
 * The Design module's public surface. Phase 0 wraps the existing Design Canvas code instead of moving it:
 * the files stay where they are and are re-exported here, so later code can import "modules/design" and a
 * future mechanical move only has to change these lines.
 */
export { DESIGN as default, DESIGN } from "./def";
export { App as DesignApp } from "../../App";
export { TopBar as DesignTopBar } from "../../components/TopBar";
export { HomeScreen } from "../../components/home/HomeScreen";
export { LearnScreen } from "../../components/learn/LearnScreen";
export { RoadmapScreen } from "../../components/roadmap/RoadmapScreen";
export { SharedView } from "../../components/share/SharedView";
export { useStore as useDesignStore } from "../../store";
