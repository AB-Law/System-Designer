import type { Problem, Submission } from "./types";

/**
 * Data access with two backends: the optional FastAPI service (/api/*) and a static fallback
 * (bundled problem files + browser storage). The UI only ever talks to this module.
 */

// Vite turns this into the bundled files; outside Vite (the test scripts) the call does not exist, and there is nothing to fall back to
let staticProblems: Record<string, Problem> = {};
try {
  staticProblems = import.meta.glob("./problems/*.json", { eager: true, import: "default" }) as Record<string, Problem>;
} catch {
  /* not running under Vite */
}
const order = { easy: 0, medium: 1, hard: 2 };

function sortProblems(ps: Problem[]): Problem[] {
  return [...ps].sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.title.localeCompare(b.title));
}

async function tryJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const backend = { online: false };

export async function loadProblems(): Promise<Problem[]> {
  const remote = await tryJson<Problem[]>("/api/problems");
  if (remote && remote.length) {
    backend.online = true;
    return sortProblems(remote);
  }
  backend.online = false;
  return sortProblems(Object.values(staticProblems));
}

const lsGet = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const lsSet = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: ignore */
  }
};
export { lsGet, lsSet };

/** Non-secret flag: the real session lives in an HttpOnly cookie (`dc_session`). */
const SESSION_FLAG = "dc:session";
/** Legacy key — cleared on read so XSS can no longer harvest a bearer token from storage. */
const LEGACY_TOKEN_KEY = "dc:token";

export const hasSession = (): boolean => {
  try {
    if (localStorage.getItem(SESSION_FLAG) === "1") return true;
    // one-shot migration from the old localStorage bearer token
    if (localStorage.getItem(LEGACY_TOKEN_KEY)) return true;
  } catch {
    /* storage unavailable */
  }
  return false;
};

export const setSession = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(SESSION_FLAG, "1");
    else {
      localStorage.removeItem(SESSION_FLAG);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    /* storage unavailable: cookie session still works until the tab closes */
  }
};

/** @deprecated use hasSession / setSession — kept so older call sites compile during the cookie migration */
export const getToken = (): string | null => {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null): void => {
  setSession(!!t);
  try {
    // never persist the bearer token; cookie + session flag are enough
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

/** true when the server is up and this browser has a signed-in session */
export const cloudOn = (): boolean => backend.online && hasSession();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Call the backend as the signed-in user. Throws ApiError with the server's plain-language message. */
export async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const legacy = getToken();
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(legacy ? { Authorization: `Bearer ${legacy}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!r.ok) {
    let msg = r.statusText || "Something went wrong";
    try {
      const j = (await r.json()) as { detail?: unknown };
      if (typeof j.detail === "string") msg = j.detail;
      else if (Array.isArray(j.detail))
        msg =
          j.detail
            .map((d: { msg?: string }) => d.msg)
            .filter(Boolean)
            .join("; ") || msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(r.status, msg);
  }
  return (await r.json()) as T;
}

export async function loadSubmissions(problemId: string): Promise<Submission[]> {
  if (cloudOn()) {
    try {
      return await call<Submission[]>(`/submissions/${problemId}`);
    } catch {
      /* fall back to this browser's copy */
    }
  }
  return lsGet<Submission[]>(`dc:subs:${problemId}`, []);
}

export async function saveSubmission(problemId: string, sub: Submission, all: Submission[]): Promise<void> {
  lsSet(`dc:subs:${problemId}`, all);
  if (cloudOn()) {
    try {
      await call(`/submissions/${problemId}`, "POST", sub);
    } catch {
      /* kept locally; the next sign-in sync uploads it */
    }
  }
}
