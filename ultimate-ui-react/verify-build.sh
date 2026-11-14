#!/usr/bin/env bash
# verify-build.sh — post-build acceptance checks with negative controls.
# Every check must FAIL when the bug is present and PASS when fixed.
# Run from the React project root after `npm run build`.
# (Based on the set-5 checklist, items 4 and 6 corrected per review:
#  greps that would fail on a correct build, or pass on a broken one,
#  are not checks. Sizes and known shaka-only strings are.)
set -u

DIST_DIR="${1:-../src/static/dist}"
FAILURES=0

check() { # check <label> <result: 0 pass, 1 fail>
  if [ "$2" -eq 0 ]; then
    echo "PASS: $1"
  else
    echo "FAIL: $1"
    FAILURES=$((FAILURES + 1))
  fi
}

# --- 1. Assets exist with fixed names -------------------------------------
[ -f "$DIST_DIR/assets/index.js" ];                      check "assets/index.js exists" $?
[ -f "$DIST_DIR/assets/index.css" ];                     check "assets/index.css exists" $?

# --- 2. Lazy shaka chunk exists -------------------------------------------
ls "$DIST_DIR"/assets/shaka-player.compiled-*.js >/dev/null 2>&1
check "lazy chunk shaka-player.compiled-*.js exists" $?

# --- 3. Main bundle does NOT contain shaka code (laziness by size) --------
# Negative control: when shaka was eagerly bundled, index.js was ~1.17 MB.
# Correct: ~392 KB. Threshold 500 KB sits far from both — it fails on the
# regression and passes on the fix.
MAIN_SIZE=$(wc -c < "$DIST_DIR/assets/index.js")
[ "$MAIN_SIZE" -lt 500000 ]
check "main bundle < 500 KB (got ${MAIN_SIZE} bytes — shaka not eagerly bundled)" $?

# --- 4. Shaka code absent from main bundle (string negative control) ------
# 'shaka.media' appears throughout the shaka library but nowhere in the app
# source. It MUST be in the lazy chunk and MUST NOT be in index.js.
grep -q 'shaka.media' "$DIST_DIR"/assets/shaka-player.compiled-*.js
check "'shaka.media' present in lazy chunk (control — proves the string works)" $?
if grep -q 'shaka.media' "$DIST_DIR/assets/index.js"; then
  check "shaka code absent from index.js" 1
else
  check "shaka code absent from index.js" 0
fi

# --- 5. German UI strings survive minification ----------------------------
for s in 'Catchup für diese Sendung' 'Keine Kanäle verfügbar'; do
  grep -q "$s" "$DIST_DIR/assets/index.js"
  check "user-facing string present: $s" $?
done

# --- 6. Minimize fix present: player-content--hidden shipped --------------
# (Not in @media nesting — it is a top-level rule; the general CSS-nesting
#  questions move to browser checks, see README manual list.)
grep -q 'player-content--hidden' "$DIST_DIR/assets/index.css"
check "minimize CSS rule shipped (player-content--hidden)" $?
# Negative control for the ref-guard fix lives in the source (shipped in
# this zip) and in the manual switch test — identifiers do not survive
# minification, so the dist grep would prove nothing.

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi
