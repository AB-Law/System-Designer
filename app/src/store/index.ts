import { create } from "zustand";
import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { BLOCK_MAP, clampCfg, defaultCfg } from "../blocks";
import { ApiError, backend, call, loadProblems, loadSubmissions, lsGet, lsSet, saveSubmission, setToken } from "../api";
import { decodeShareHash, docToDesign, sanitizeDoc, toDoc } from "../cloud/doc";
import { flushDesign, pullDesign, syncSubmissionsDown, syncUp } from "../cloud/sync";
import { addVersion, listVersions, removeVersion, renameVersion, sameAsNewest, type VersionKind } from "../cloud/versions";
import { callModel, loadAiSettings, reviewDesign, saveAiSettings } from "../ai/review";
import { buildChatMessages, describeChange, parseChanges } from "../ai/chat";
import { analyze } from "../sim/analyze";
import { capIdsOf, primaryCapability } from "../sim/caps";
import { isStepDone, validateRoadmap } from "../roadmap";
import { learnHash, parseLearnHash } from "../lessons/route";
import type { ChatMessage, Problem, RunResult, Scenario, Submission } from "../types";
import { edgeProps, errText, freeSpot, layered, nextId, toDesign } from "./canvas";
import { useMode } from "./mode";
import { fromDoc, persist, restore, wipeLocalData } from "./persist";
import type { RFEdge, RFNode, SharedComment, State, User } from "./types";

export type { RFEdge, RFNode, SharedComment, SharedView, Snapshot, State, User } from "./types";
export { edgeProps, toDesign } from "./canvas";

let lastCfgEdit = { key: "", at: 0 };

export const useStore = create<State>((set, get) => {
  const commit = () => {
    const { nodes, edges, past } = get();
    set({ past: [...past.slice(-60), { nodes, edges }], future: [] });
  };
  const save = () => {
    const { problemId, nodes, edges } = get();
    if (problemId) persist(problemId, nodes, edges);
  };

  /** Keep a snapshot of the canvas. Automatic ones skip a design identical to the newest version. */
  const autoVersion = async (kind: VersionKind, label: string, force = false) => {
    const { problemId, nodes, edges, problems, interview, versions } = get();
    if (!problemId || nodes.length === 0) return;
    const doc = toDoc(nodes, edges);
    if (!force && kind !== "manual" && sameAsNewest(versions, doc)) return;
    let stats: { score: number; passed: number; total: number } | undefined;
    const problem = problems.find((p) => p.id === problemId);
    if (problem) {
      try {
        const r = analyze(docToDesign(doc), problem, { followUps: interview });
        stats = { score: r.score, passed: r.scenarios.filter((x) => x.pass).length, total: r.scenarios.length };
      } catch {
        /* a half-built design can still be saved without a score */
      }
    }
    try {
      const v = await addVersion(problemId, { label, kind, doc, ...stats });
      if (get().problemId === problemId) set({ versions: [v, ...get().versions] });
    } catch (e) {
      if (get().problemId === problemId) set({ versionsError: errText(e) });
    }
  };

  return {
    problems: [],
    problemId: "",
    nodes: [],
    edges: [],
    past: [],
    future: [],
    pasteCount: 0,
    edgeMode: "sync",
    rightTab: "problem",
    simScenario: "",
    runOpen: false,
    submissions: [],
    ai: loadAiSettings(),
    aiOpen: false,
    reviewing: false,
    interview: [],
    chatOpen: false,
    chat: [],
    chatBusy: false,
    view: "home",
    user: null,
    authOpen: false,
    shareOpen: false,
    compareOpen: false,
    fitTick: 0,
    versions: [],
    shared: null,
    learnLessonId: null,
    learnPageId: null,
    learnFrom: "home",
    roadmapSelectedStepId: null,
    primerOpen: false,
    primerProblemId: null,
    celebrate: null,

    init: async () => {
      const problems = await loadProblems();
      validateRoadmap(problems);
      set({ problems });
      if (backend.online) {
        // cookie session (or a one-shot legacy bearer) — 401 means guest
        try {
          const me = await call<{ user: User }>("/auth/me");
          setToken("1"); // session flag only; clears any legacy bearer from localStorage
          set({ user: me.user });
          await syncSubmissionsDown();
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) setToken(null);
        }
      }
      const last = lsGet<string>("dc:last", "");
      const id = problems.find((p) => p.id === last)?.id ?? problems.find((p) => p.id === "ad_serving")?.id ?? problems[0]?.id ?? "";
      if (id) await get().setProblem(id);
      await get().openFromHash();
      window.addEventListener("hashchange", () => void get().openFromHash());
    },

    setView: (v) => {
      // leaving the lessons clears their address, so a reload or a copied link does not drag the learner back
      if (v !== "learn" && parseLearnHash(location.hash)) history.pushState(null, "", location.pathname + location.search);
      if (v === "learn") get().openLearn(get().learnLessonId ?? undefined, get().learnPageId ?? undefined);
      else set({ view: v, roadmapSelectedStepId: v === "canvas" ? null : get().roadmapSelectedStepId });
    },
    openLearn: (lessonId, pageId, replace) => {
      const target = learnHash({ lessonId, pageId });
      // the address is the source of truth: back, forward, reload and pasted links all arrive through openFromHash
      if (location.hash === target) {
        void get().openFromHash();
      } else if (replace) {
        history.replaceState(null, "", location.pathname + location.search + target);
        void get().openFromHash();
      } else {
        location.hash = target;
      }
    },
    setRoadmapSelectedStepId: (id) => set({ roadmapSelectedStepId: id }),
    openPrimer: (problemId) => set({ primerOpen: true, primerProblemId: problemId }),
    closePrimer: () => set({ primerOpen: false, primerProblemId: null }),
    clearCelebrate: () => set({ celebrate: null }),

    startRoadmapStep: async (problemId) => {
      await get().setProblem(problemId);
      set({ view: "canvas", roadmapSelectedStepId: null, primerOpen: false, primerProblemId: null });
    },

    setProblem: async (id) => {
      await flushDesign();
      await pullDesign(id);
      const snap = restore(id);
      const problem = get().problems.find((p) => p.id === id);
      lsSet("dc:last", id);
      set({
        problemId: id,
        ...snap,
        past: [],
        future: [],
        selectedEdgeId: undefined,
        simScenario: problem?.scenarios[0]?.id ?? "",
        review: undefined,
        interview: lsGet<Scenario[]>(`dc:interview:${id}`, []),
        chat: lsGet<ChatMessage[]>(`dc:chat:${id}`, []),
        chatBusy: false,
        reviewKey: undefined,
        reviewError: undefined,
        versions: [],
        versionsError: undefined,
        submissions: await loadSubmissions(id),
      });
      void get().loadVersions();
    },

    onNodesChange: (changes) => {
      if (changes.some((c) => c.type === "remove")) commit();
      set({ nodes: applyNodeChanges(changes, get().nodes) });
      if (changes.some((c) => (c.type === "position" && c.dragging === false) || c.type === "remove")) save();
    },
    onEdgesChange: (changes) => {
      if (changes.some((c) => c.type === "remove")) commit();
      set({ edges: applyEdgeChanges(changes, get().edges) });
      if (changes.some((c) => c.type === "remove")) save();
    },
    beginDrag: () => commit(),

    addNode: (blockId, position) => {
      commit();
      const def = BLOCK_MAP[blockId];
      const id = nextId(blockId);
      const cfg = defaultCfg(def);
      if (blockId === "user") {
        // start from the load the current problem describes; the player can still change it
        const t = get().problems.find((p) => p.id === get().problemId)?.traffic;
        if (t) Object.assign(cfg, { users: t.users, reqPerUser: t.reqPerUser });
      }
      // a new server or service starts out serving the problem's main request; the player can change what it hosts
      const problem = get().problems.find((p) => p.id === get().problemId);
      const primary = problem ? primaryCapability(problem) : undefined;
      const capabilities = problem?.capabilities?.length
        ? ["server", "service", "websocket"].includes(blockId) && primary
          ? [primary.id]
          : []
        : undefined;
      const existing = get().nodes;
      const start = position ?? { x: existing.length ? Math.max(...existing.map((n) => n.position.x)) + 210 : 60, y: 200 };
      const node: RFNode = {
        id,
        type: "block",
        position: freeSpot(existing, start),
        data: { blockId, cfg, responsibilities: [], capabilities },
        selected: useMode.getState().mode === "configure",
      };
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node], selectedEdgeId: undefined });
      save();
      return id;
    },

    connect: (c) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const { edges, edgeMode } = get();
      if (edges.some((e) => e.source === c.source && e.target === c.target)) return;
      commit();
      const e: RFEdge = {
        id: `e-${c.source}-${c.target}`,
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle,
        targetHandle: c.targetHandle,
        ...edgeProps(edgeMode),
      } as RFEdge;
      set({ edges: [...edges, e] });
      save();
    },

    select: (nodeId, edgeId) =>
      set({
        nodes: get().nodes.map((n) => (!!n.selected === (n.id === nodeId) ? n : { ...n, selected: n.id === nodeId })),
        selectedEdgeId: edgeId,
      }),

    copySelection: () => {
      const { nodes, edges } = get();
      const picked = nodes.filter((n) => n.selected);
      if (!picked.length) return;
      const ids = new Set(picked.map((n) => n.id));
      const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
      set({
        clipboard: { nodes: clone(picked), edges: clone(edges.filter((e) => ids.has(e.source) && ids.has(e.target))) },
        pasteCount: 0,
      });
    },

    paste: () => {
      const { clipboard, nodes, edges, pasteCount } = get();
      if (!clipboard || !clipboard.nodes.length) return;
      commit();
      const n = pasteCount + 1;
      const offset = 36 * n;
      const idMap = new Map<string, string>();
      const fresh: RFNode[] = clipboard.nodes.map((c) => {
        const id = nextId(c.data.blockId);
        idMap.set(c.id, id);
        return { ...JSON.parse(JSON.stringify(c)), id, selected: true, position: { x: c.position.x + offset, y: c.position.y + offset } };
      });
      const freshEdges: RFEdge[] = clipboard.edges.map((e) => {
        const kind = e.data?.kind ?? "sync";
        const source = idMap.get(e.source)!;
        const target = idMap.get(e.target)!;
        return {
          id: `e-${source}-${target}`,
          source,
          target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          ...edgeProps(kind),
        } as RFEdge;
      });
      set({
        nodes: [...nodes.map((x) => ({ ...x, selected: false })), ...fresh],
        edges: [...edges, ...freshEdges],
        pasteCount: n,
        selectedEdgeId: undefined,
      });
      save();
    },

    duplicate: () => {
      get().copySelection();
      get().paste();
    },

    selectAll: () => set({ nodes: get().nodes.map((n) => (n.selected ? n : { ...n, selected: true })) }),

    deleteSelected: () => {
      const { nodes, edges } = get();
      const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
      if (!gone.size) return;
      commit();
      set({ nodes: nodes.filter((n) => !gone.has(n.id)), edges: edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) });
      save();
    },

    setCfg: (nodeId, key, value) => {
      const stamp = `${nodeId}:${key}`;
      const now = Date.now();
      if (lastCfgEdit.key !== stamp || now - lastCfgEdit.at > 1200) commit();
      lastCfgEdit = { key: stamp, at: now };
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, cfg: { ...n.data.cfg, [key]: value } } } : n)) });
      save();
    },

    setResponsibilities: (nodeId, list) => {
      commit();
      set({ nodes: get().nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, responsibilities: list } } : n)) });
      save();
    },

    autoLayout: () => {
      const { nodes, edges } = get();
      if (!nodes.length) return;
      commit();
      const pos = layered(nodes, edges);
      set({ nodes: nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })) });
      save();
    },

    toggleCapability: (nodeId, capId) => {
      commit();
      set({
        nodes: get().nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const have = capIdsOf(
            n.data.blockId,
            n.data.capabilities,
            get().problems.find((p) => p.id === get().problemId),
          );
          const next = have.includes(capId) ? have.filter((x) => x !== capId) : [...have, capId];
          return { ...n, data: { ...n.data, capabilities: next } };
        }),
      });
      save();
    },

    deleteNode: (nodeId) => {
      commit();
      set({
        nodes: get().nodes.filter((n) => n.id !== nodeId),
        edges: get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      });
      save();
    },

    setEdgeKind: (kind) => {
      const { selectedEdgeId, edges } = get();
      set({ edgeMode: kind });
      if (selectedEdgeId) {
        commit();
        set({ edges: edges.map((e) => (e.id === selectedEdgeId ? ({ ...e, ...edgeProps(kind) } as RFEdge) : e)) });
        save();
      }
    },

    undo: () => {
      const { past, nodes, edges, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ ...prev, past: past.slice(0, -1), future: [{ nodes, edges }, ...future], selectedEdgeId: undefined });
      save();
    },
    redo: () => {
      const { past, nodes, edges, future } = get();
      const next = future[0];
      if (!next) return;
      set({ ...next, past: [...past, { nodes, edges }], future: future.slice(1), selectedEdgeId: undefined });
      save();
    },
    clearAll: () => {
      commit();
      set({ nodes: [], edges: [], selectedEdgeId: undefined });
      save();
    },

    setRightTab: (t) => set({ rightTab: t }),
    setSimScenario: (id) => set({ simScenario: id }),
    setRunOpen: (b) => {
      set({ runOpen: b });
      if (b) void autoVersion("auto", "Ran the simulation");
    },
    setAi: (a) => {
      saveAiSettings(a);
      set({ ai: a });
    },
    setAiOpen: (b) => set({ aiOpen: b }),
    clearInterview: () => {
      lsSet(`dc:interview:${get().problemId}`, []);
      set({ interview: [] });
    },

    setChatOpen: (b) => set({ chatOpen: b }),

    sendChat: async (text) => {
      const q = text.trim();
      if (!q || get().chatBusy) return;
      const { problems, problemId, nodes, edges, ai, chat, interview } = get();
      const problem = problems.find((p) => p.id === problemId);
      if (!problem) return;
      const keep = (list: ChatMessage[]) => lsSet(`dc:chat:${problemId}`, list.slice(-40));
      const asked: ChatMessage[] = [...chat, { role: "user", content: q }];
      if (ai.provider === "off") {
        const out: ChatMessage[] = [
          ...asked,
          { role: "assistant", content: "The AI is turned off. Click AI in the top bar and choose LM Studio or OpenAI, then ask again." },
        ];
        set({ chat: out });
        keep(out);
        return;
      }
      set({ chat: asked, chatBusy: true });
      try {
        const design = toDesign(nodes, edges);
        const run = analyze(design, problem, { followUps: interview });
        const reply = await callModel(ai, buildChatMessages(problem, design, run, asked));
        const { text: visible, changes } = parseChanges(reply, problem, design);
        const out: ChatMessage[] = [
          ...asked,
          {
            role: "assistant",
            content: visible || "(The coach sent only a proposal.)",
            changes: changes.length ? changes : undefined,
            summary: changes.length ? changes.map((c) => describeChange(c, design, changes, problem)) : undefined,
            status: changes.length ? "pending" : undefined,
          },
        ];
        set({ chat: out, chatBusy: false });
        keep(out);
      } catch (e) {
        const out: ChatMessage[] = [
          ...asked,
          { role: "assistant", content: `Sorry, I could not answer: ${e instanceof Error ? e.message : String(e)}` },
        ];
        set({ chat: out, chatBusy: false });
        keep(out);
      }
    },

    // The coach only proposes. Nothing reaches the canvas until the learner presses Apply, and it is one undo step.
    applyChat: (index) => {
      const { chat, nodes, edges, problems, problemId } = get();
      const msg = chat[index];
      if (!msg?.changes || msg.status !== "pending") return;
      const problem = problems.find((p) => p.id === problemId);
      const primary = problem ? primaryCapability(problem) : undefined;
      void autoVersion("coach", "Before the coach's change");
      commit();
      let newNodes = nodes.map((n) => ({ ...n, selected: false }));
      let newEdges = [...edges];
      const refToId = new Map<string, string>();
      let nextX = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) + 210 : 60;
      for (const ch of msg.changes) {
        if (ch.op === "add_block") {
          const def = BLOCK_MAP[ch.blockId];
          if (!def) continue;
          const id = nextId(ch.blockId);
          refToId.set(ch.ref, id);
          const cfg = clampCfg(def, { ...defaultCfg(def), ...ch.settings });
          const capabilities =
            ch.capabilities ??
            (problem?.capabilities?.length
              ? ["server", "service", "websocket"].includes(ch.blockId) && primary
                ? [primary.id]
                : []
              : undefined);
          newNodes.push({
            id,
            type: "block",
            position: freeSpot(newNodes, { x: nextX, y: 200 }),
            data: { blockId: ch.blockId, cfg, responsibilities: [], capabilities },
            selected: true,
          });
          nextX += 210;
        } else if (ch.op === "set_settings") {
          newNodes = newNodes.map((n) => {
            if (n.id !== ch.nodeId) return n;
            const def = BLOCK_MAP[n.data.blockId];
            return {
              ...n,
              data: {
                ...n.data,
                cfg: clampCfg(def, { ...n.data.cfg, ...ch.settings }),
                capabilities: ch.capabilities ?? n.data.capabilities,
              },
            };
          });
        } else if (ch.op === "disconnect") {
          newEdges = newEdges.filter((e) => !(e.source === ch.from && e.target === ch.to));
        } else {
          const source = refToId.get(ch.from) ?? ch.from;
          const target = refToId.get(ch.to) ?? ch.to;
          if (
            !newNodes.some((n) => n.id === source) ||
            !newNodes.some((n) => n.id === target) ||
            newEdges.some((e) => e.source === source && e.target === target)
          )
            continue;
          newEdges.push({ id: `e-${source}-${target}`, source, target, ...edgeProps(ch.kind) } as RFEdge);
        }
      }
      const out = chat.map((m, i) => (i === index ? { ...m, status: "applied" as const } : m));
      set({ nodes: newNodes, edges: newEdges, chat: out });
      lsSet(`dc:chat:${problemId}`, out.slice(-40));
      save();
    },

    dismissChat: (index) => {
      const out = get().chat.map((m, i) => (i === index && m.status === "pending" ? { ...m, status: "dismissed" as const } : m));
      set({ chat: out });
      lsSet(`dc:chat:${get().problemId}`, out.slice(-40));
    },

    clearChat: () => {
      lsSet(`dc:chat:${get().problemId}`, []);
      set({ chat: [] });
    },

    runReview: async () => {
      const { problems, problemId, nodes, edges, ai } = get();
      const problem = problems.find((p) => p.id === problemId);
      if (!problem) return;
      const design = toDesign(nodes, edges);
      set({ reviewing: true, reviewError: undefined });
      try {
        const run = analyze(design, problem);
        const review = await reviewDesign(ai, problem, design, run);
        // the interviewer's new questions replace the old ones and are kept for next time
        const followUps = review.followUps ?? [];
        if (followUps.length) lsSet(`dc:interview:${problemId}`, followUps);
        set({ review, reviewKey: JSON.stringify(design), interview: followUps.length ? followUps : get().interview, reviewing: false });
      } catch (e) {
        set({ reviewing: false, reviewError: e instanceof Error ? e.message : String(e) });
      }
    },

    submit: async () => {
      const { problems, problemId, nodes, edges, submissions, review, reviewKey, interview } = get();
      const problem = problems.find((p) => p.id === problemId);
      if (!problem) return;
      const design = toDesign(nodes, edges);
      const result: RunResult = analyze(design, problem, {
        followUps: interview,
        verdicts: review?.verdicts && reviewKey === JSON.stringify(design) ? review.verdicts : undefined,
      });
      const sub: Submission = {
        at: Date.now(),
        score: result.score,
        passed: result.scenarios.filter((s) => s.pass).length,
        total: result.scenarios.length,
        result,
        review,
      };
      const all = [sub, ...submissions];
      await saveSubmission(problemId, sub, all);
      void autoVersion("auto", `Submitted, score ${result.score}`, true);
      const celebrate = isStepDone(all) ? { problemId } : get().celebrate;
      set({ submissions: all, rightTab: "submissions", runOpen: false, celebrate });
    },

    setAuthOpen: (b) => set({ authOpen: b }),
    setShareOpen: (b) => set({ shareOpen: b }),
    setCompareOpen: (b, a) => set({ compareOpen: b, compareA: b ? a : undefined }),

    importDoc: async (doc) => {
      await autoVersion("restore", "Before importing a file");
      get().loadDoc(doc);
    },

    signIn: async (mode, username, password, inviteCode) => {
      try {
        const r = await call<{ token: string; user: User }>(mode === "login" ? "/auth/login" : "/auth/register", "POST", {
          username,
          password,
          inviteCode: inviteCode || undefined,
        });
        const owner = lsGet<string | null>("dc:owner", null);
        if (owner && owner !== r.user.username) wipeLocalData();
        lsSet("dc:owner", r.user.username);
        setToken("1"); // HttpOnly cookie carries the secret; flag only marks signed-in for the UI
        set({ user: r.user, authOpen: false });
        await syncUp(get().problems);
        await syncSubmissionsDown();
        await get().setProblem(get().problemId);
        return null;
      } catch (e) {
        return errText(e);
      }
    },

    signOut: async () => {
      await flushDesign();
      try {
        await call("/auth/logout", "POST");
      } catch {
        /* the token is dropped here either way */
      }
      setToken(null);
      set({ user: null, versions: [] });
      await get().setProblem(get().problemId);
    },

    loadVersions: async () => {
      const id = get().problemId;
      if (!id) return;
      try {
        const list = await listVersions(id);
        if (get().problemId === id) set({ versions: list, versionsError: undefined });
      } catch (e) {
        if (get().problemId === id) set({ versionsError: errText(e) });
      }
    },

    saveVersion: async (label) => {
      await autoVersion("manual", label.trim() || "Saved version", true);
    },

    // restoring is safe: the current canvas is saved as a version first, and the restore is one undo step
    restoreVersion: async (id) => {
      const v = get().versions.find((x) => x.id === id);
      const doc = v && sanitizeDoc(v.doc);
      if (!v || !doc) return;
      await autoVersion("restore", `Before restoring "${v.label}"`);
      get().loadDoc(doc);
    },

    renameVersion: async (id, label) => {
      const pid = get().problemId;
      try {
        await renameVersion(pid, id, label.trim() || "Saved version");
        await get().loadVersions();
      } catch (e) {
        set({ versionsError: errText(e) });
      }
    },

    deleteVersion: async (id) => {
      const pid = get().problemId;
      try {
        await removeVersion(pid, id);
        set({ versions: get().versions.filter((v) => v.id !== id) });
      } catch (e) {
        set({ versionsError: errText(e) });
      }
    },

    loadDoc: (doc) => {
      commit();
      set({ ...fromDoc(doc), selectedEdgeId: undefined, fitTick: get().fitTick + 1 });
      save();
    },

    openFromHash: async () => {
      const h = location.hash;
      const learn = parseLearnHash(h);
      if (learn) {
        const from = get().view;
        set({
          view: "learn",
          learnLessonId: learn.lessonId ?? null,
          learnPageId: learn.pageId ?? null,
          ...(from !== "learn" ? { learnFrom: from } : {}),
        });
        return;
      }
      // back or forward onto an address with no lesson in it leaves the lessons
      if (get().view === "learn") set({ view: get().learnFrom });
      const t = /^#share=([\w-]{8,64})$/.exec(h);
      if (t) {
        try {
          if (!backend.online) throw new Error("This link needs the Design Canvas server, which is not running.");
          const r = await call<{
            token: string;
            problemId: string;
            label: string;
            owner: string;
            score: number | null;
            created: number;
            doc: unknown;
            comments: SharedComment[];
            mine: boolean;
          }>(`/s/${t[1]}`);
          const doc = sanitizeDoc(r.doc);
          if (!doc) throw new Error("That shared design could not be read.");
          set({
            view: "shared",
            shared: {
              source: "server",
              token: r.token,
              problemId: r.problemId,
              label: r.label,
              owner: r.owner,
              score: r.score,
              created: r.created,
              doc,
              comments: r.comments,
              mine: r.mine,
            },
            sharedError: undefined,
          });
        } catch (e) {
          set({ view: "shared", shared: null, sharedError: errText(e) });
        }
        return;
      }
      if (h.startsWith("#d=")) {
        const p = await decodeShareHash(h);
        if (p)
          set({
            view: "shared",
            shared: { source: "link", problemId: p.problemId, label: p.label, doc: p.doc, comments: [], mine: false },
            sharedError: undefined,
          });
        else set({ view: "shared", shared: null, sharedError: "That link is damaged or too large to open." });
      }
    },

    closeShared: () => {
      history.replaceState(null, "", location.pathname + location.search);
      set({ shared: null, sharedError: undefined, view: "home" });
    },

    useSharedAsMine: async () => {
      const s = get().shared;
      if (!s) return;
      if (!get().problems.some((p) => p.id === s.problemId)) {
        set({ sharedError: "This problem is not in your copy of the app." });
        return;
      }
      await get().setProblem(s.problemId);
      if (get().nodes.length) await autoVersion("restore", "Before opening a shared design");
      get().loadDoc(s.doc);
      history.replaceState(null, "", location.pathname + location.search);
      set({ view: "canvas", shared: null, sharedError: undefined });
    },

    postComment: async (text) => {
      const s = get().shared;
      if (!s?.token) return "Comments need a link from a signed-in person.";
      try {
        await call(`/s/${s.token}/comments`, "POST", { text });
        const r = await call<{ comments: SharedComment[]; mine: boolean }>(`/s/${s.token}`);
        set({ shared: { ...s, comments: r.comments, mine: r.mine } });
        return null;
      } catch (e) {
        return errText(e);
      }
    },

    deleteComment: async (id) => {
      const s = get().shared;
      if (!s?.token) return;
      try {
        await call(`/s/${s.token}/comments/${id}`, "DELETE");
        set({ shared: { ...s, comments: s.comments.filter((c) => c.id !== id) } });
      } catch {
        /* the comment stays; nothing to undo */
      }
    },
  };
});

export function useProblem(): Problem | undefined {
  return useStore((s) => s.problems.find((p) => p.id === s.problemId));
}
