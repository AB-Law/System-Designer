import { Dashboard } from "./components/Dashboard";
import { TargetsPage } from "./components/TargetsPage";
import { parse } from "./route";
import "./hub.css";

export default function Screen({ rest }: { rest: string }) {
  const route = parse(rest);
  return <div className="hub-module">{route.name === "targets" ? <TargetsPage /> : <Dashboard />}</div>;
}
