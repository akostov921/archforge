// Shared helpers for ArchForge hooks.
// State lives at $CLAUDE_PROJECT_DIR/.archforge/. Atomic writes via tmp+rename.

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ArchforgeState {
  phase: number; // 0 = requirements, ..., 7 = execute, -1 = not started
  triage: "quick" | "feature" | "product" | null;
  goal: string | null;
  started_at: string | null;
  updated_at: string | null;
  critique_cycles: number;
}

export interface EditLogEntry {
  ts: number; // ms since epoch
  tool: string;
  file: string;
  old_hash: string;
  new_hash: string;
  new_len: number;
}

export function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function archforgeDir(): string {
  return path.join(projectDir(), ".archforge");
}

export function statePath(): string {
  return path.join(archforgeDir(), "state.json");
}

export function editLogPath(): string {
  return path.join(archforgeDir(), ".cache", "edits.log");
}

export function ensureDirs(): void {
  fs.mkdirSync(archforgeDir(), { recursive: true });
  fs.mkdirSync(path.join(archforgeDir(), ".cache"), { recursive: true });
}

export function readState(): ArchforgeState {
  try {
    const raw = fs.readFileSync(statePath(), "utf8");
    return JSON.parse(raw) as ArchforgeState;
  } catch {
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

export function writeStateAtomic(s: ArchforgeState): void {
  ensureDirs();
  s.updated_at = new Date().toISOString();
  const tmp = statePath() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, statePath());
}

export function shortHash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

export function appendEditLog(e: EditLogEntry): void {
  ensureDirs();
  fs.appendFileSync(editLogPath(), JSON.stringify(e) + "\n");
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
        // skip malformed lines
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
