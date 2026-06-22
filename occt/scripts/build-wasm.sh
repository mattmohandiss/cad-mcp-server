#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT}/build"
DIST_DIR="${ROOT}/dist"

OCCT_INCLUDE_DIR="${OCCT_INCLUDE_DIR:-/opt/occt-build/include/opencascade}"
OCCT_LIB_DIR="${OCCT_LIB_DIR:-/opt/occt-build/lin32/clang/lib}"

if [[ ! -d "${OCCT_INCLUDE_DIR}" ]]; then
  echo "error: OCCT include dir not found: ${OCCT_INCLUDE_DIR}" >&2
  exit 1
fi

if [[ ! -d "${OCCT_LIB_DIR}" ]]; then
  echo "error: OCCT lib dir not found: ${OCCT_LIB_DIR}" >&2
  exit 1
fi

mkdir -p "${BUILD_DIR}" "${DIST_DIR}"

sources=()
while IFS= read -r -d '' src; do
  sources+=("${src}")
done < <(find "${ROOT}/facade/src" "${ROOT}/facade/generated" -name '*.cpp' -print0 | sort -z)

objects=()
for src in "${sources[@]}"; do
  rel="${src#"${ROOT}/"}"
  obj="${BUILD_DIR}/${rel//\//_}.o"
  objects+=("${obj}")

  if [[ -f "${obj}" && "${obj}" -nt "${src}" && "${obj}" -nt "${ROOT}/facade/include/occt_kernel.h" ]]; then
    continue
  fi

  echo "Compiling ${rel}"
  em++ -std=c++17 -fwasm-exceptions -O3 -msimd128 \
    -DIGNORE_NO_ATOMICS=1 -DOCCT_NO_PLUGINS \
    -I"${OCCT_INCLUDE_DIR}" -I"${ROOT}/facade/include" \
    -w -c "${src}" -o "${obj}"
done

libs=()
while IFS= read -r -d '' lib; do
  libs+=("${lib}")
done < <(find "${OCCT_LIB_DIR}" -name '*.a' -print0 | sort -z)

if [[ ${#libs[@]} -eq 0 ]]; then
  echo "error: no OCCT static libraries found in ${OCCT_LIB_DIR}" >&2
  exit 1
fi

echo "Linking ${DIST_DIR}/occt-wasm.js with ${#objects[@]} objects and ${#libs[@]} OCCT libs"
em++ \
  -lembind \
  -fwasm-exceptions \
  -msimd128 \
  -mtail-call \
  -O3 \
  -flto \
  -sINITIAL_MEMORY=134217728 \
  -sMAXIMUM_MEMORY=4294967296 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORT_ES6=1 \
  -sEVAL_CTORS=2 \
  -sWASM_BIGINT \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=createOcctWasm \
  '-sEXPORTED_RUNTIME_METHODS=["FS","HEAP32","HEAPF32","HEAPU32"]' \
  -sEXPORT_EXCEPTION_HANDLING_HELPERS=1 \
  --no-entry \
  "${objects[@]}" \
  "${libs[@]}" \
  -o "${DIST_DIR}/occt-wasm.js"

if [[ "${ENABLE_WASM_OPT:-0}" == "1" ]]; then
  if ! command -v wasm-opt >/dev/null 2>&1; then
    echo "error: ENABLE_WASM_OPT=1 but wasm-opt was not found" >&2
    exit 1
  fi

  echo "Optimizing ${DIST_DIR}/occt-wasm.wasm"
  wasm-opt -O4 --strip-debug --strip-producers \
    --converge \
    --enable-bulk-memory --enable-sign-ext \
    --enable-nontrapping-float-to-int --enable-mutable-globals \
    --enable-exception-handling --enable-simd --enable-tail-call \
    "${DIST_DIR}/occt-wasm.wasm" -o "${DIST_DIR}/occt-wasm.wasm"
else
  echo "Skipping wasm-opt; set ENABLE_WASM_OPT=1 for release builds"
fi

du -h "${DIST_DIR}/occt-wasm.wasm"
