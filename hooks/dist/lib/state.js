"use strict";
// Shared helpers for ArchForge hooks.
// State lives at $CLAUDE_PROJECT_DIR/.archforge/. Atomic writes via tmp+rename
// with retry (Windows EPERM) and an advisory lockfile (concurrent sessions).
// Edit log uses full SHA-256 (no truncation) and is rotated on every write
// to keep size bounded.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectDir = projectDir;
exports.archforgeDir = archforgeDir;
exports.statePath = statePath;
exports.lockPath = lockPath;
exports.editLogPath = editLogPath;
exports.ensureDirs = ensureDirs;
exports.readState = readState;
exports.writeStateAtomic = writeStateAtomic;
exports.fullHash = fullHash;
exports.shortHash = shortHash;
exports.appendEditLog = appendEditLog;
exports.readEditLog = readEditLog;
exports.readHookEvent = readHookEvent;
exports.emitDecision = emitDecision;
exports.emitAllow = emitAllow;
exports.isWhitelistedPath = isWhitelistedPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
// ---- Path resolution with explicit env-var checks ----
function projectDir() {
    const v = process.env.CLAUDE_PROJECT_DIR;
    if (!v || v.trim() === "") {
        process.stderr.write("[archforge] WARN: CLAUDE_PROJECT_DIR is unset; falling back to cwd. " +
            "Hook state may not match intended project. " +
            "If this hook is firing during SessionStart or another phase where " +
            "the env var is documented as unset, this is expected and benign.\n");
        return process.cwd();
    }
    return v;
}
function archforgeDir() {
    return path.join(projectDir(), ".archforge");
}
function statePath() {
    return path.join(archforgeDir(), "state.json");
}
function lockPath() {
    return path.join(archforgeDir(), "state.lock");
}
function editLogPath() {
    return path.join(archforgeDir(), ".cache", "edits.log");
}
function ensureDirs() {
    fs.mkdirSync(archforgeDir(), { recursive: true });
    fs.mkdirSync(path.join(archforgeDir(), ".cache"), { recursive: true });
}
// ---- State read/write with retry + lockfile ----
function readState() {
    try {
        const raw = fs.readFileSync(statePath(), "utf8");
        const parsed = JSON.parse(raw);
        // Validate shape — corrupt JSON is more dangerous than missing JSON.
        if (typeof parsed.phase !== "number")
            throw new Error("state.phase missing");
        return parsed;
    }
    catch (err) {
        const code = err.code;
        if (code !== "ENOENT") {
            process.stderr.write("[archforge] WARN: state.json unreadable or corrupt: " +
                String(err) + "; treating as not-started.\n");
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
function sleepSync(ms) {
    const end = Date.now() + ms;
    // Busy-wait — acceptable for a short retry loop in a sub-100ms hook.
    while (Date.now() < end) {
        /* spin */
    }
}
function acquireLock() {
    const lp = lockPath();
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        try {
            // wx = exclusive create; fails if file exists.
            const fd = fs.openSync(lp, "wx");
            return fd;
        }
        catch (err) {
            const code = err.code;
            if (code === "EEXIST") {
                // Another writer holds it. Check if stale.
                try {
                    const st = fs.statSync(lp);
                    if (Date.now() - st.mtimeMs > 5000) {
                        // > 5s old: writer crashed. Steal.
                        fs.unlinkSync(lp);
                        continue;
                    }
                }
                catch {
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
function releaseLock(fd) {
    if (fd == null)
        return;
    try {
        fs.closeSync(fd);
    }
    catch {
        /* ignore */
    }
    try {
        fs.unlinkSync(lockPath());
    }
    catch {
        /* ignore */
    }
}
function renameWithRetry(from, to) {
    for (let i = 0; i < RETRY_ATTEMPTS; i++) {
        try {
            fs.renameSync(from, to);
            return;
        }
        catch (err) {
            const code = err.code;
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
function writeStateAtomic(s) {
    ensureDirs();
    const lockFd = acquireLock();
    try {
        s.updated_at = new Date().toISOString();
        const tmp = statePath() + ".tmp." + process.pid + "." + Date.now();
        fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
        renameWithRetry(tmp, statePath());
    }
    finally {
        releaseLock(lockFd);
    }
}
// ---- Hashing: full SHA-256, no truncation ----
function fullHash(s) {
    return crypto.createHash("sha256").update(s).digest("hex");
}
// Backwards-compat name (do NOT use for new collision-sensitive comparisons).
function shortHash(s) {
    return fullHash(s);
}
// ---- Edit log: append + rotate ----
const EDIT_LOG_WINDOW_MS = 15 * 60 * 1000;
function appendEditLog(e) {
    ensureDirs();
    // Append first (cheap), then rotate.
    fs.appendFileSync(editLogPath(), JSON.stringify(e) + "\n");
    rotateEditLog();
}
function rotateEditLog() {
    // Keep only entries newer than EDIT_LOG_WINDOW_MS. Cheap rewrite.
    try {
        const raw = fs.readFileSync(editLogPath(), "utf8");
        const cutoff = Date.now() - EDIT_LOG_WINDOW_MS;
        const kept = [];
        for (const line of raw.split("\n")) {
            if (!line.trim())
                continue;
            try {
                const e = JSON.parse(line);
                if (e.ts >= cutoff)
                    kept.push(line);
            }
            catch {
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
    }
    catch {
        /* rotation is best-effort */
    }
}
function readEditLog(windowMs) {
    try {
        const raw = fs.readFileSync(editLogPath(), "utf8");
        const cutoff = Date.now() - windowMs;
        const entries = [];
        for (const line of raw.split("\n")) {
            if (!line.trim())
                continue;
            try {
                const e = JSON.parse(line);
                if (e.ts >= cutoff)
                    entries.push(e);
            }
            catch {
                /* skip */
            }
        }
        return entries;
    }
    catch {
        return [];
    }
}
function readHookEvent() {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim())
        return {};
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function emitDecision(d) {
    const out = {
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: d.permissionDecision,
            ...(d.reason ? { permissionDecisionReason: d.reason } : {}),
            ...(d.additionalContext ? { additionalContext: d.additionalContext } : {}),
        },
    };
    process.stdout.write(JSON.stringify(out));
}
function emitAllow() {
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
function isWhitelistedPath(absFilePath) {
    const root = projectDir();
    let rel = path.relative(root, absFilePath);
    rel = rel.replace(/\\/g, "/");
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        // Paths outside the project (e.g. /tmp/foo) — let other tools decide.
        // For BuildGate this means "not blocked by us"; for BashGate too.
        return true;
    }
    if (WHITELIST_FILES.has(rel))
        return true;
    for (const prefix of WHITELIST_PREFIXES) {
        if (rel.startsWith(prefix))
            return true;
    }
    // Root-level .md is allowed for planning notes.
    if (!rel.includes("/") && rel.endsWith(".md"))
        return true;
    return false;
}
