#!/usr/bin/env bash
# Tests the BuildGate import scanner at state.phase=7.
# Sets up a throwaway project dir with .archforge/state.json and library-claims.md,
# runs the hook against fixtures, asserts the decision.

set -euo pipefail

cd "$(dirname "$0")/.."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/.archforge"
cat > "$TMP/.archforge/state.json" <<EOF
{"phase":7,"triage":"product","goal":"test","started_at":null,"updated_at":null,"critique_cycles":0}
EOF

run_hook() {
  local fixture="$1"
  local file_path="$2"
  # Replace the file_path in fixture so it points inside TMP (otherwise the
  # hook treats it as outside-the-project and short-circuits to allow).
  node -e '
    const fs=require("fs");
    const f=process.argv[1], fp=process.argv[2];
    const j=JSON.parse(fs.readFileSync(f,"utf8"));
    j.tool_input.file_path = fp;
    j.cwd = process.env.CLAUDE_PROJECT_DIR;
    process.stdout.write(JSON.stringify(j));
  ' "$fixture" "$file_path" | CLAUDE_PROJECT_DIR="$TMP" node dist/build-gate.js
}

echo "=== Test 1: undocumented stripe import → expect deny ==="
out1="$(run_hook test/sample-edit-with-undocumented-import.json "$TMP/src/billing.ts")"
echo "$out1"
if echo "$out1" | grep -q '"permissionDecision":"deny"' && echo "$out1" | grep -q "stripe"; then
  echo "PASS"
else
  echo "FAIL: expected deny mentioning 'stripe'"
  exit 1
fi

echo
echo "=== Test 2: same import after stripe documented → expect allow ==="
mkdir -p "$TMP/.archforge"
cat > "$TMP/.archforge/library-claims.md" <<EOF
# Library Claims

| Package | Symbol | Evidence URL | Summary | Verified at |
|---------|--------|--------------|---------|-------------|
| stripe | Stripe constructor | https://docs.stripe.com/api | Initialize Stripe SDK | 2026-05-07T12:00:00Z |
EOF
out2="$(run_hook test/sample-edit-with-undocumented-import.json "$TMP/src/billing.ts")"
echo "$out2"
if echo "$out2" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS"
else
  echo "FAIL: expected allow after documenting stripe"
  exit 1
fi

echo
echo "=== Test 3: only stdlib imports → expect allow ==="
cat > "$TMP/fixture-stdlib.json" <<EOF
{"session_id":"test","cwd":"$TMP","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"$TMP/src/util.ts","content":"import fs from 'fs'\nimport path from 'path'\nexport const X = 1\n"},"tool_use_id":"t3"}
EOF
out3="$(CLAUDE_PROJECT_DIR="$TMP" node dist/build-gate.js < "$TMP/fixture-stdlib.json")"
echo "$out3"
if echo "$out3" | grep -q '"permissionDecision":"allow"'; then
  echo "PASS"
else
  echo "FAIL: stdlib-only imports should be allowed"
  exit 1
fi

echo
echo "=== Test 4: pre-Phase-7 source edit → expect deny (existing behavior) ==="
cat > "$TMP/.archforge/state.json" <<EOF
{"phase":3,"triage":"product","goal":"test","started_at":null,"updated_at":null,"critique_cycles":0}
EOF
out4="$(CLAUDE_PROJECT_DIR="$TMP" node dist/build-gate.js < "$TMP/fixture-stdlib.json")"
echo "$out4"
if echo "$out4" | grep -q '"permissionDecision":"deny"' && echo "$out4" | grep -q "Phase 7"; then
  echo "PASS"
else
  echo "FAIL: expected pre-Phase-7 deny"
  exit 1
fi

echo
echo "All BuildGate tests passed."
