import { create } from "zustand";
import { BLOCK_MAP, money } from "../blocks";
import { analyze } from "../sim/analyze";
import { toDesign, useStore } from "./index";

export interface PlaceNotice {
  id: number;
  tone: "warn" | "info";
  text: string;
  action?: { label: string; run: () => void };
}

interface NoticeStore {
  notice: PlaceNotice | null;
  show: (n: Omit<PlaceNotice, "id">) => void;
  clear: () => void;
}

let seq = 0;
export const useNotice = create<NoticeStore>((set) => ({
  notice: null,
  show: (n) => set({ notice: { ...n, id: ++seq } }),
  clear: () => set({ notice: null }),
}));

/** The setting that says how many copies of a block run, if it has one. */
export function replicaKey(blockId: string): string | undefined {
  const def = BLOCK_MAP[blockId];
  if (!def) return undefined;
  for (const sec of def.sections)
    for (const f of sec.fields) if (f.type === "number" && (f.key === "replicas" || f.key === "instances")) return f.key;
  return undefined;
}

const NO_MERGE = new Set(["user"]);

function costOf(): { cost: number; budget?: number } | undefined {
  const s = useStore.getState();
  const problem = s.problems.find((p) => p.id === s.problemId);
  if (!problem) return undefined;
  const r = analyze(toDesign(s.nodes, s.edges), problem);
  return { cost: r.cost, budget: problem.budget };
}

/**
 * Add a block, then say what the player should know right now: whether it pushed the design over budget, and whether an
 * identical block is already there (one block with more copies is simpler than two). Used by the palette and by drops on the canvas.
 */
export function placeBlock(blockId: string, position?: { x: number; y: number }): string {
  const s = useStore.getState();
  const def = BLOCK_MAP[blockId];
  const before = costOf();
  const twin = s.nodes.find((n) => n.data.blockId === blockId && !NO_MERGE.has(blockId));
  const id = s.addNode(blockId, position);
  const after = costOf();
  const notices: Omit<PlaceNotice, "id">[] = [];

  const key = replicaKey(blockId);
  const added = useStore.getState().nodes.find((n) => n.id === id);
  if (twin && key && added && JSON.stringify(twin.data.cfg) === JSON.stringify(added.data.cfg)) {
    const copies = Number(twin.data.cfg[key] ?? 1);
    notices.push({
      tone: "info",
      text: `You already have an identical ${def.label}. One block with ${copies + 1} copies does the same job and is easier to read.`,
      action: {
        label: `Use ${copies + 1} copies instead`,
        run: () => {
          const st = useStore.getState();
          st.deleteNode(id);
          st.setCfg(twin.id, key, copies + 1);
          useNotice.getState().clear();
        },
      },
    });
  }
  if (after && after.budget !== undefined && after.cost > after.budget && (before?.cost ?? 0) <= after.budget) {
    notices.push({
      tone: "warn",
      text: `Adding a ${def.label} puts the estimate at ${money(after.cost)} a month, over the ${money(after.budget)} budget.`,
    });
  } else if (after && after.budget !== undefined && after.cost > after.budget && before && after.cost > before.cost) {
    notices.push({ tone: "warn", text: `Still over budget: ${money(after.cost)} a month against ${money(after.budget)}.` });
  }
  const first = notices.find((n) => n.tone === "warn") ?? notices[0];
  if (first)
    useNotice
      .getState()
      .show(notices.length > 1 ? { ...first, text: `${notices[0].text} ${notices[1].text}`, action: notices[0].action } : first);
  else useNotice.getState().clear();
  return id;
}
