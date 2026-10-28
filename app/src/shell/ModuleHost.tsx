import { Suspense } from "react";
import { backend } from "../api";
import { useStore } from "../store";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ToastHost } from "../ui/Toast";
import { DESIGN, availability } from "./registry";
import { SignInGate } from "./SignInGate";
import { goModule } from "./route";
import type { ModuleDef } from "./types";
import { useModules } from "./useActiveModule";

/** Renders a non-Design module, or a short explanation when it needs a backend or a signed-in user. */
export function ModuleHost({ module, rest }: { module: ModuleDef; rest: string }) {
  const user = useStore((s) => s.user);
  useStore((s) => s.problems); // loading problems is what sets backend.online, so re-check access when they arrive
  const state = availability(module, { backendOnline: backend.online, signedIn: !!user });
  const modules = useModules();
  const Screen = module.Screen;

  return (
    <main className="module-host">
      {state === "needs-backend" ? (
        <EmptyState
          title={`${module.title} needs the server`}
          action={<Button onClick={() => goModule(DESIGN, modules)}>Back to Design Canvas</Button>}
        >
          This part of the app saves your data on the server, so it is not available in standalone mode. Design Canvas still works fully
          offline.
        </EmptyState>
      ) : state === "needs-signin" ? (
        <SignInGate module={module} />
      ) : Screen ? (
        <Suspense fallback={<EmptyState title="Loading" />}>
          <Screen rest={rest} />
        </Suspense>
      ) : null}
      <ToastHost />
    </main>
  );
}
