#!/usr/bin/env bash
# vim: ts=2 sw=2 et
# validate-facade.sh — cross-reference OCCT facade method lists for consistency.
#
# Checks that every MethodSpec in config.rs has a matching declaration in:
#   1. occt_kernel.h   (C++ header)
#   2. raw-types.ts    (Embind raw interface)
#   3. index.ts        (TS wrapper)
#
# Also reports stale declarations in the header or TS files that have
# no corresponding config.rs entry (informational only).

set -euo pipefail
shopt -s inherit_errexit

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATUS=0

# Known internal/helper methods in the header that are NOT in config.rs
# because they are private implementation details of the hand-written facade.
KNOWN_INTERNAL_HEADER=(
  buildMeshData
  getEdgeGroupsPtr
  getFaceGroupsPtr
  getIndicesPtr
  getNormalsPtr
  getPointsPtr
  getPositionsPtr
  getShapeOffsetsPtr
  getUvsPtr
  store
)

# Known config.rs methods that intentionally have NO standalone TS wrapper
# in index.ts because they are called internally via `this.#raw.xxx()` by
# higher-level wrappers, or are low-level memory/IO helpers.
KNOWN_RAW_ONLY=(
  allocBytes
  exportBrepBinary
  freeBytes
  getShapeCount
  importBrepBinary
  solidFromShell
  tessellateRelative
  vectorF64FromHeap
  vectorI32FromHeap
  vectorU32FromHeap
)

# ── Extract method names from config.rs ──────────────────────────────────
extract_config_methods() {
  grep -oP '(?<=name:\s")[^"]+' "${ROOT}/kernel/xtask/src/codegen/config.rs" \
    | sort -u
}

# ── Extract method names from occt_kernel.h ──────────────────────────────
# Matches "return_type method_name(...)" lines in the public section.
extract_header_methods() {
  grep -oP '^\s+\S+\s+\K\w+(?=\()' "${ROOT}/kernel/facade/include/occt_kernel.h" \
    | grep -vx 'OcctKernel' \
    | sort -u
}

# ── Extract method names from raw-types.ts (OcctRawKernel interface) ─────
extract_raw_methods() {
  # Match lines like:     methodName(params): returnType;
  grep -oP '(?<=^\s{4})\w+(?=\()' "${ROOT}/kernel/ts/src/raw-types.ts" \
    | sort -u
}

# ── Extract method names from index.ts (wrapper class) ───────────────────
extract_index_methods() {
  # Match lines like:     methodName(params): returnType {
  # Strip leading whitespace, then filter out non-public methods.
  grep -oP '^\s{4}\w+(?=\()' "${ROOT}/kernel/ts/src/index.ts" \
    | sed 's/^\s*//' \
    | grep -vE '^(private|protected|public|static|constructor|get|set)$' \
    | sort -u
}

# ── Check if an element is in a bash array ───────────────────────────────
in_array() {
  local needle="$1"
  shift
  for e in "$@"; do [[ "${e}" == "${needle}" ]] && return 0; done
  return 1
}

echo "═══ Facade cross-reference validation ═══"
echo ""

# ── Build method sets ────────────────────────────────────────────────────
CONFIG_METHODS="$(extract_config_methods)"
HEADER_METHODS="$(extract_header_methods)"
RAW_METHODS="$(extract_raw_methods)"
INDEX_METHODS="$(extract_index_methods)"

CONFIG_COUNT="$(echo "${CONFIG_METHODS}" | wc -l)"
HEADER_COUNT="$(echo "${HEADER_METHODS}" | wc -l)"
RAW_COUNT="$(echo "${RAW_METHODS}" | wc -l)"
INDEX_COUNT="$(echo "${INDEX_METHODS}" | wc -l)"

echo "Method counts:"
echo "  config.rs    : ${CONFIG_COUNT}"
echo "  occt_kernel.h: ${HEADER_COUNT}"
echo "  raw-types.ts : ${RAW_COUNT}"
echo "  index.ts     : ${INDEX_COUNT}"
echo ""

# ── Check 1: config methods present in header (HARD FAIL) ────────────────
echo "─── Check 1: config.rs → occt_kernel.h ───"
MISSING_IN_HEADER=()
while IFS= read -r m; do
  if ! echo "${HEADER_METHODS}" | grep -qxF "${m}"; then
    MISSING_IN_HEADER+=("${m}")
  fi
done <<< "${CONFIG_METHODS}"

if [ ${#MISSING_IN_HEADER[@]} -eq 0 ]; then
  echo "  ✅ All ${CONFIG_COUNT} config methods are declared in the header."
else
  echo "  ❌ ${#MISSING_IN_HEADER[@]} methods in config.rs but NOT in occt_kernel.h:"
  for m in "${MISSING_IN_HEADER[@]}"; do
    echo "     • ${m}"
  done
  STATUS=1
fi
echo ""

# ── Check 2: header methods NOT in config (informational) ────────────────
echo "─── Check 2: occt_kernel.h → config.rs (stale/internal declarations) ───"
STALE_IN_HEADER=()
while IFS= read -r m; do
  if ! echo "${CONFIG_METHODS}" | grep -qxF "${m}"; then
    if ! in_array "${m}" "${KNOWN_INTERNAL_HEADER[@]}"; then
      STALE_IN_HEADER+=("${m}")
    fi
  fi
done <<< "${HEADER_METHODS}"

if [ ${#STALE_IN_HEADER[@]} -eq 0 ]; then
  echo "  ✅ No unexpected declarations in the header."
else
  echo "  ⚠️  ${#STALE_IN_HEADER[@]} header declarations with no config.rs entry (possibly dead):"
  for m in "${STALE_IN_HEADER[@]}"; do
    echo "     • ${m}"
  done
fi
echo ""

# ── Check 3: config methods present in raw-types.ts (HARD FAIL) ──────────
echo "─── Check 3: config.rs → raw-types.ts ───"
MISSING_IN_RAW=()
while IFS= read -r m; do
  if ! echo "${RAW_METHODS}" | grep -qxF "${m}"; then
    MISSING_IN_RAW+=("${m}")
  fi
done <<< "${CONFIG_METHODS}"

if [ ${#MISSING_IN_RAW[@]} -eq 0 ]; then
  echo "  ✅ All ${CONFIG_COUNT} config methods are declared in raw-types.ts."
else
  echo "  ❌ ${#MISSING_IN_RAW[@]} methods in config.rs but NOT in raw-types.ts:"
  for m in "${MISSING_IN_RAW[@]}"; do
    echo "     • ${m}"
  done
  STATUS=1
fi
echo ""

# ── Check 4: config methods present in index.ts wrapper ──────────────────
echo "─── Check 4: config.rs → index.ts ───"
MISSING_IN_INDEX=()
while IFS= read -r m; do
  if ! echo "${INDEX_METHODS}" | grep -qxF "${m}"; then
    if ! in_array "${m}" "${KNOWN_RAW_ONLY[@]}"; then
      MISSING_IN_INDEX+=("${m}")
    fi
  fi
done <<< "${CONFIG_METHODS}"

if [ ${#MISSING_IN_INDEX[@]} -eq 0 ]; then
  echo "  ✅ All ${CONFIG_COUNT} config methods have wrappers in index.ts."
else
  echo "  ❌ ${#MISSING_IN_INDEX[@]} methods in config.rs but NO wrapper in index.ts:"
  for m in "${MISSING_IN_INDEX[@]}"; do
    echo "     • ${m}"
  done
  STATUS=1
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────
echo "═══ Summary ═══"
if [ "${STATUS}" -eq 0 ]; then
  echo "✅ All checks passed."
else
  echo "❌ Some checks failed (see above)."
fi

exit "${STATUS}"
