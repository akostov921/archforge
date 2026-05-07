// Shared helpers for ArchForge hooks.
// State lives at $CLAUDE_PROJECT_DIR/.archforge/. Atomic writes via tmp+rename
// with retry (Windows EPERM) and an advisory lockfile (concurrent sessions).
// Edit log uses full SHA-256 (no truncation) and is rotated on every write
// to keep size bounded.

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ArchforgeState {
  phase: number;
  triage: "quick" | "feature" | "product" | null;
  goal: string | null;
  started_at: string | null;
  updated_at: string | null;
  critique_cycles: number;
}

export interface EditLogEntry {
  ts: number;
  tool: string;
  file: string;
  old_hash: string; // full sha256 (64 hex chars)
  new_hash: string;
  new_len: number;
}

// ---- Path resolution with explicit env-var checks ----

export function projectDir(): string {
  const v = process.env.CLAUDE_PROJECT_DIR;
  if (!v || v.trim() === "") {
    process.stderr.write(
      "[archforge] WARN: CLAUDE_PROJECT_DIR is unset; falling back to cwd. " +
      "Hook state may not match intended project. " +
      "If this hook is firing during SessionStart or another phase where " +
      "the env var is documented as unset, this is expected and benign.\n"
    );
    return process.cwd();
  }
  return v;
}

export function archforgeDir(): string {
  return path.join(projectDir(), ".archforge");
}

export function statePath(): string {
  return path.join(archforgeDir(), "state.json");
}

export function lockPath(): string {
  return path.join(archforgeDir(), "state.lock");
}

export function editLogPath(): string {
  return path.join(archforgeDir(), ".cache", "edits.log");
}

export function ensureDirs(): void {
  fs.mkdirSync(archforgeDir(), { recursive: true });
  fs.mkdirSync(path.join(archforgeDir(), ".cache"), { recursive: true });
}

// ---- State read/write with retry + lockfile ----

export function readState(): ArchforgeState {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw) as ArchforgeState;
    // Validate shape — corrupt JSON is more dangerous than missing JSON.
    if (typeof parsed.phase !== "number") throw new Error("state.phase missing");
    return parsed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      process.stderr.write(
        "[archforge] WARN: state.json unreadable or corrupt: " +
        String(err) + "; treating as not-started.\n"
      );
    }
    return {
      phase: -1,
      triage: null,
      goal: null,
      started_at: null,
      updated_at: null,
      critique_cycles: 0,
    };
  }
}

const RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 50;

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  // Busy-wait — acceptable for a short retry loop in a sub-100ms hook.
  while (Date.now() < end) {
    /* spin */
  }
}

function acquireLock(): number | null {
  const lp = lockPath();
  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try {
      // wx = exclusive create; fails if file exists.
      const fd = fs.openSync(lp, "wx");
      return fd;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        // Another writer holds it. Check if stale.
        try {
          const st = fs.statSync(lp);
          if (Date.now() - st.mtimeMs > 5000) {
            // > 5s old: writer crashed. Steal.
            fs.unlinkSync(lp);
            continue;
          }
        } catch {
          /* race: lock vanished */
        }
        sleepSync(RETRY_BACKOFF_MS * (i + 1));
        continue;
      }
      // Some other error — give up acquiring; caller will skip locking.
      return null;
    }
  }
  return null;
}

function releaseLock(fd: number | null): void {
  if (fd == null) return;
  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(lockPath());
  } catch {
    /* ignore */
  }
}

function renameWithRetry(from: string, to: string): void {
  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // Windows-flavor errors; also EBUSY on some filesystems.
      if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
        sleepSync(RETRY_BACKOFF_MS * (i + 1));
        continue;
      }
      throw err;
    }
  }
  // Final attempt — let exception bubble.
  fs.renameSync(from, to);
}

export function writeStateAtomic(s: ArchforgeState): void {
  ensureDirs();
  const lockFd = acquireLock();
  try {
    s.updated_at = new Date().toISOString();
    const tmp = statePath() + ".tmp." + process.pid + "." + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    renameWithRetry(tmp, statePath());
  } finally {
    releaseLock(lockFd);
  }
}

// ---- Hashing: full SHA-256, no truncation ----

export function fullHash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Backwards-compat name (do NOT use for new collision-sensitive comparisons).
export function shortHash(s: string): string {
  return fullHash(s);
}

// ---- Edit log: append + rotate ----

const EDIT_LOG_WINDOW_MS = 15 * 60 * 1000;

export function appendEditLog(e: EditLogEntry): void {
  ensureDirs();
  // Append first (cheap), then rotate.
  fs.appendFileSync(editLogPath(), JSON.stringify(e) + "\n");
  rotateEditLog();
}

function rotateEditLog(): void {
  // Keep only entries newer than EDIT_LOG_WINDOW_MS. Cheap rewrite.
  try {
    const raw = fs.readFileSync(editLogPath(), "utf8");
    const cutoff = Date.now() - EDIT_LOG_WINDOW_MS;
    const kept: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as EditLogEntry;
        if (e.ts >= cutoff) kept.push(line);
      } catch {
        /* drop malformed */
      }
    }
    // If everything is recent, skip rewrite (no change).
    const newRaw = kept.join("\n") + (kept.length ? "\n" : "");
    if (newRaw.length !== raw.length) {
      const tmp = editLogPath() + ".tmp";
      fs.writeFileSync(tmp, newRaw);
      renameWithRetry(tmp, editLogPath());
    }
  } catch {
    /* rotation is best-effort */
  }
}

export function readEditLog(windowMs: number): EditLogEntry[] {
  try {
    const raw = fs.readFileSync(editLogPath(), "utf8");
    const cutoff = Date.now() - windowMs;
    const entries: EditLogEntry[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as EditLogEntry;
        if (e.ts >= cutoff) entries.push(e);
      } catch {
        /* skip */
      }
    }
    return entries;
  } catch {
    return [];
  }
}

// ---- Hook I/O ----

export interface HookEvent {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

export function readHookEvent(): HookEvent {
  const raw = fs.readFileSync(0, "utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as HookEvent;
  } catch {
    return {};
  }
}

export interface PreToolUseDecision {
  permissionDecision: "allow" | "deny" | "ask";
  reason?: string;
  additionalContext?: string;
}

export function emitDecision(d: PreToolUseDecision): void {
  const out: Record<string, unknown> = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: d.permissionDecision,
      ...(d.reason ? { permissionDecisionReason: d.reason } : {}),
      ...(d.additionalContext ? { additionalContext: d.additionalContext } : {}),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

export function emitAllow(): void {
  emitDecision({ permissionDecision: "allow" });
}

// ---- Path whitelist (shared by build-gate and bash-gate) ----

const WHITELIST_PREFIXES = [".archforge/", "docs/"];
const WHITELIST_FILES = new Set([
  "BUILD_PLAN.md",
  "BUILD_PLAN_CRITIQUE.md",
  "FINAL_REVIEW.md",
  "README.md",
  "LICENSE",
  ".gitignore",
  "CHANGELOG.md",
]);

export function isWhitelistedPath(absFilePath: string): boolean {
  const root = projectDir();
  let rel = path.relative(root, absFilePath);
  rel = rel.replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    // Paths outside the project (e.g. /tmp/foo) — let other tools decide.
    // For BuildGate this means "not blocked by us"; for BashGate too.
    return true;
  }
  if (WHITELIST_FILES.has(rel)) return true;
  for (const prefix of WHITELIST_PREFIXES) {
    if (rel.startsWith(prefix)) return true;
  }
  // Root-level .md is allowed for planning notes.
  if (!rel.includes("/") && rel.endsWith(".md")) return true;
  return false;
}
