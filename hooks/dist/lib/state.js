"use strict";
// Shared helpers for ArchForge hooks.
// State lives at $CLAUDE_PROJECT_DIR/.archforge/. Atomic writes via tmp+rename.
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
exports.editLogPath = editLogPath;
exports.ensureDirs = ensureDirs;
exports.readState = readState;
exports.writeStateAtomic = writeStateAtomic;
exports.shortHash = shortHash;
exports.appendEditLog = appendEditLog;
exports.readEditLog = readEditLog;
exports.readHookEvent = readHookEvent;
exports.emitDecision = emitDecision;
exports.emitAllow = emitAllow;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
function projectDir() {
    return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
function archforgeDir() {
    return path.join(projectDir(), ".archforge");
}
function statePath() {
    return path.join(archforgeDir(), "state.json");
}
function editLogPath() {
    return path.join(archforgeDir(), ".cache", "edits.log");
}
function ensureDirs() {
    fs.mkdirSync(archforgeDir(), { recursive: true });
    fs.mkdirSync(path.join(archforgeDir(), ".cache"), { recursive: true });
}
function readState() {
    try {
        const raw = fs.readFileSync(statePath(), "utf8");
        return JSON.parse(raw);
    }
    catch {
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
function writeStateAtomic(s) {
    ensureDirs();
    s.updated_at = new Date().toISOString();
    const tmp = statePath() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, statePath());
}
function shortHash(s) {
    return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}
function appendEditLog(e) {
    ensureDirs();
    fs.appendFileSync(editLogPath(), JSON.stringify(e) + "\n");
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
                // skip malformed lines
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
