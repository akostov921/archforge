// BashGate: closes the F12 bypass — Bash commands that mutate files via
// redirects, tee, sed -i, awk -i, perl -i, or truncate to non-whitelisted paths.
// Fires only when state.phase < 7. Best-effort heuristic, not airtight:
// limitations are documented in README.

import * as path from "path";
import {
  readHookEvent,
  readState,
  emitAllow,
  emitDecision,
  isWhitelistedPath,
  projectDir,
} from "./lib/state";

interface MutationHit {
  pattern: string;
  target: string;
}

// Patterns that indicate a file mutation. For each match, group 1 captures
// the target path. Each regex must be safe to run against user-supplied input
// (no catastrophic backtracking — keep them anchored and bounded).
const MUTATION_PATTERNS: { name: string; re: RegExp }[] = [
  // > path  /  >> path  (redirect)
  // Skip /dev/null and /dev/std*. Skip when followed by another > (>>>).
  {
    name: "redirect",
    re: /(?:^|[\s;|&(])>{1,2}\s*([^\s|;&<>()`$]+)/g,
  },
  // tee path / tee -a path / tee --append path
  {
    name: "tee",
    re: /(?:^|[\s;|&])tee(?:\s+(?:-a|--append))?\s+([^\s|;&<>()`$]+)/g,
  },
  // sed -i / sed -i'' / sed -i.bak  + last positional arg
  {
    name: "sed -i",
    re: /(?:^|[\s;|&])(?:g?sed)\s+(?:[^|;&]*?\s)?-i(?:[a-zA-Z0-9.'"]*)?\s+(?:[^|;&]*?\s)?([^\s|;&<>()`$]+)/g,
  },
  // awk -i inplace ... file
  {
    name: "awk -i inplace",
    re: /(?:^|[\s;|&])awk\s+(?:[^|;&]*?\s)?-i\s+inplace\s+(?:[^|;&]*?\s)?([^\s|;&<>()`$]+)/g,
  },
  // perl -i / perl -pi
  {
    name: "perl -i",
    re: /(?:^|[\s;|&])perl\s+(?:[^|;&]*?\s)?-[a-zA-Z]*i[a-zA-Z]*\s+(?:[^|;&]*?\s)?([^\s|;&<>()`$]+)/g,
  },
  // truncate <path>
  {
    name: "truncate",
    re: /(?:^|[\s;|&])truncate(?:\s+(?:-s\s*\S+|--size=\S+))?\s+([^\s|;&<>()`$]+)/g,
  },
];

const SAFE_TARGETS = new Set([
  "/dev/null",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/stdin",
]);

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const f = s[0];
    const l = s[s.length - 1];
    if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function resolveTarget(target: string): string {
  const cleaned = stripQuotes(target);
  if (path.isAbsolute(cleaned)) return cleaned;
  return path.resolve(projectDir(), cleaned);
}

function findMutations(command: string): MutationHit[] {
  const hits: MutationHit[] = [];
  for (const { name, re } of MUTATION_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(command)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const cleaned = stripQuotes(raw);
      if (!cleaned) continue;
      if (SAFE_TARGETS.has(cleaned)) continue;
      // Skip pure file descriptors like &1, &2 (already filtered by char class but defensive).
      if (cleaned.startsWith("&")) continue;
      hits.push({ pattern: name, target: cleaned });
    }
  }
  return hits;
}

function classify(targets: MutationHit[]): MutationHit[] {
  // Return only the hits that are NOT whitelisted (i.e. the offenders).
  const offenders: MutationHit[] = [];
  for (const h of targets) {
    const abs = resolveTarget(h.target);
    // isWhitelistedPath returns true for paths outside the project root
    // (e.g. /tmp/foo when project is elsewhere), so we don't need a separate
    // /tmp shortcut.
    if (isWhitelistedPath(abs)) continue;
    offenders.push({ pattern: h.pattern, target: abs });
  }
  return offenders;
}

function main(): void {
  const ev = readHookEvent();
  if (ev.tool_name !== "Bash") {
    emitAllow();
    return;
  }
  const state = readState();
  if (state.phase >= 7) {
    emitAllow();
    return;
  }
  const cmd = (ev.tool_input?.command as string) || "";
  if (!cmd) {
    emitAllow();
    return;
  }
  const hits = findMutations(cmd);
  if (hits.length === 0) {
    emitAllow();
    return;
  }
  const offenders = classify(hits);
  if (offenders.length === 0) {
    emitAllow();
    return;
  }
  const summary = offenders
    .slice(0, 5)
    .map((o) => `  - ${o.pattern} → ${o.target}`)
    .join("\n");
  emitDecision({
    permissionDecision: "deny",
    reason:
      "ArchForge BashGate: this Bash command writes to source paths but plan is not finalized (state.phase=" +
      state.phase +
      "). Detected:\n" +
      summary +
      "\n\nIf you intended a planning/docs edit, target a whitelisted path " +
      "(.archforge/, docs/, root *.md). For source code, finish Phase 6 approval first. " +
      "Use the Edit/Write tool instead of shell redirects so changes are reviewable.",
  });
}

try {
  main();
} catch (err) {
  process.stderr.write(
    "[archforge bash-gate] ERROR (failing open, bash command NOT gated this call): " +
      String(err) + "\n"
  );
  emitAllow();
}
