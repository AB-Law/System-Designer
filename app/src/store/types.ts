import type { Connection, Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import type { DesignDoc } from "../cloud/doc";
import type { Version } from "../cloud/versions";
import type {
  AiReview,
  AiSettings,
  ChatMessage,
  EdgeData,
  EdgeKind,
  NodeData,
  Problem,
  Scenario,
  SharedComment,
  SharedView,
  Submission,
  User,
} from "../types";

export type { SharedComment, SharedView, User };

export type RFNode = Node<NodeData>;
export type RFEdge = Edge<EdgeData>;
export type Snapshot = { nodes: RFNode[]; edges: RFEdge[] };

export interface State {
  problems: Problem[];
  problemId: string;
  nodes: RFNode[];
  edges: RFEdge[];
  past: Snapshot[];
  future: Snapshot[];
  selectedEdgeId?: string;
  clipboard?: Snapshot;
  pasteCount: number;
  edgeMode: EdgeKind;
  rightTab: "problem" | "simulate" | "submissions" | "versions";
  simScenario: string;
  runOpen: boolean;
  submissions: Submission[];
  ai: AiSettings;
  aiOpen: boolean;
  reviewing: boolean;
  review?: AiReview;
  /** the interviewer's follow-up tests for this problem. They re-run on the design as it changes. */
  interview: Scenario[];
  /** the design the review was about, so its verdicts only count while the design is unchanged */
  reviewKey?: string;
  reviewError?: string;
  chatOpen: boolean;
  chat: ChatMessage[];
  chatBusy: boolean;

  /** home page, canvas workbench, learning roadmap, a design someone shared, or the lessons */
  view: "home" | "canvas" | "roadmap" | "shared" | "learn";
  user: User | null;
  authOpen: boolean;
  shareOpen: boolean;
  compareOpen: boolean;
  /** bumps whenever a whole design is loaded, so the canvas re-fits it */
  fitTick: number;
  /** version the compare window starts on (the other side is the current canvas) */
  compareA?: string;
  versions: Version[];
  versionsError?: string;
  shared: SharedView | null;
  sharedError?: string;
  /** lesson and page open in the Learn view; they mirror the address (#/learn/<lesson>/<page>) */
  learnLessonId: string | null;
  learnPageId: string | null;
  /** the view the learner came from, so Back from a lesson returns there */
  learnFrom: State["view"];
  /** problem id whose step detail side panel is open on the roadmap */
  roadmapSelectedStepId: string | null;
  /** primer overlay (from roadmap or Problem tab) */
  primerOpen: boolean;
  /** problem id for the primer overlay when open */
  primerProblemId: string | null;
  /** celebration after a Done submission */
  celebrate: { problemId: string } | null;

  init: () => Promise<void>;
  setProblem: (id: string) => Promise<void>;
  setView: (v: State["view"]) => void;
  /** open the lesson list, a lesson, or one page of it. This changes the address; the view follows from it. */
  openLearn: (lessonId?: string, pageId?: string, replace?: boolean) => void;
  setRoadmapSelectedStepId: (id: string | null) => void;
  openPrimer: (problemId: string) => void;
  closePrimer: () => void;
  clearCelebrate: () => void;
  onNodesChange: (c: NodeChange<RFNode>[]) => void;
  onEdgesChange: (c: EdgeChange<RFEdge>[]) => void;
  beginDrag: () => void;
  addNode: (blockId: string, position?: { x: number; y: number }) => string;
  autoLayout: () => void;
  connect: (c: Connection) => void;
  select: (nodeId?: string, edgeId?: string) => void;
  copySelection: () => void;
  paste: () => void;
  duplicate: () => void;
  selectAll: () => void;
  deleteSelected: () => void;
  setCfg: (nodeId: string, key: string, value: unknown) => void;
  setResponsibilities: (nodeId: string, list: string[]) => void;
  toggleCapability: (nodeId: string, capId: string) => void;
  deleteNode: (nodeId: string) => void;
  setEdgeKind: (kind: EdgeKind) => void;
  undo: () => void;
  redo: () => void;
  clearAll: () => void;
  setRightTab: (t: State["rightTab"]) => void;
  setSimScenario: (id: string) => void;
  setRunOpen: (b: boolean) => void;
  setAi: (a: AiSettings) => void;
  setAiOpen: (b: boolean) => void;
  clearInterview: () => void;
  setChatOpen: (b: boolean) => void;
  sendChat: (text: string) => Promise<void>;
  applyChat: (index: number) => void;
  dismissChat: (index: number) => void;
  clearChat: () => void;
  runReview: () => Promise<void>;
  submit: () => Promise<void>;
  startRoadmapStep: (problemId: string) => Promise<void>;

  setAuthOpen: (b: boolean) => void;
  signIn: (mode: "login" | "register", username: string, password: string, inviteCode?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setShareOpen: (b: boolean) => void;
  setCompareOpen: (b: boolean, a?: string) => void;
  importDoc: (doc: DesignDoc) => Promise<void>;
  loadVersions: () => Promise<void>;
  saveVersion: (label: string) => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  renameVersion: (id: string, label: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
  loadDoc: (doc: DesignDoc) => void;
  openFromHash: () => Promise<void>;
  closeShared: () => void;
  useSharedAsMine: () => Promise<void>;
  postComment: (text: string) => Promise<string | null>;
  deleteComment: (id: number) => Promise<void>;
}
