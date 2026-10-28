import { call } from "../../api";
import type { Summary, Target, TargetInput } from "./types";

export const hubApi = {
  summary: () => call<Summary>("/hub/summary"),
  targets: () => call<Target[]>("/hub/targets"),
  target: (id: number) => call<Target>(`/hub/targets/${id}`),
  createTarget: (body: TargetInput) => call<Target>("/hub/targets", "POST", body),
  patchTarget: (id: number, body: Partial<TargetInput>) => call<Target>(`/hub/targets/${id}`, "PATCH", body),
  removeTarget: (id: number) => call<{ ok: boolean }>(`/hub/targets/${id}`, "DELETE"),
  setActive: (targetId: number) => call<{ ok: boolean }>("/hub/targets/active", "PUT", { targetId }),
};
