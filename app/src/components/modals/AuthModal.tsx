import { useState } from "react";
import { useStore } from "../../store";

export function AuthModal() {
  const signIn = useStore((s) => s.signIn);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => setAuthOpen(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await signIn(mode, username.trim(), password, invite.trim());
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="overlay" onClick={close}>
      <form
        className="modal narrow"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-label="Account"
      >
        <button type="button" className="x" onClick={close} aria-label="Close">
          ×
        </button>
        <h3 className="m-h">{mode === "login" ? "Sign in" : "Create an account"}</h3>
        <div className="m-body">
          <nav className="tabs sm" aria-label="Sign in or create an account">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
              Sign in
            </button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
              Create account
            </button>
          </nav>
          <p className="muted">
            An account keeps your designs, versions and scores on the server, so they follow you across devices. It also lets you share
            links and join cohorts.
            {mode === "register" && " Sign-up is invite-only: ask whoever shared this app for the invite code."}
          </p>
          <div className="col">
            <label htmlFor="auth-user">User name</label>
            <input
              id="auth-user"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3 to 24 letters, digits or _"
            />
          </div>
          <div className="col">
            <label htmlFor="auth-pass">Password</label>
            <input
              id="auth-pass"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : ""}
            />
          </div>
          {mode === "register" && (
            <div className="col">
              <label htmlFor="auth-invite">Invite code</label>
              <input id="auth-invite" autoComplete="off" value={invite} onChange={(e) => setInvite(e.target.value)} />
            </div>
          )}
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="m-foot">
          <button type="button" className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || username.trim().length < 3 || password.length < (mode === "register" ? 8 : 1)}
          >
            {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
