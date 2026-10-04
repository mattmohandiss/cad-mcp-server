# cad-mcp Architectural Review — Root Cause, Architecture, Simplifications

## 1. Root cause of `importAssembly: memory access out of bounds`

**The name is misleading and so is the address-space theory. This is a stale typed-array
view over a grown heap — a JS-side pointer bug, not an OCCT or WASM bug.**

The chain, in order of certainty:

**(a) The heap grows, which replaces the ArrayBuffer.** `occt/scripts/build-wasm.sh:63-65`
sets `-sALLOW_MEMORY_GROWTH=1`. When Emscripten grows linear memory it allocates a **new**
`ArrayBuffer` and rebinds `HEAPU8/HEAPU32/HEAPF32`. Any view captured before the growth now
points at a detached buffer.

**(b) `#readVector` uses a byte address as an element index.** `src/occt-wasm/index.ts:1764-1765`:

```ts
const ptr = heapPtr(vec.dataPtr());
return Array.from(new HeapArray(this.#module.HEAPU32.buffer as ArrayBuffer, ptr, count));
```

`dataPtr()` is generated as `reinterpret_cast<uintptr_t>(v.data())` — a **byte** address
(`occt/facade/generated/bindings.cpp:12-22`, emitted by `occt/codegen/src/emitter.rs:281-289`).
`HeapArray` is `Float64Array`/`Int32Array`/`Uint32Array`, whose constructors take an
**element** offset. The missing `/ BYTES_PER_ELEMENT` is present everywhere else — compare
`#copyF32/#copyU32/#copyI32` at `index.ts:1840-1851`, which correctly divide. So this path
reads at **4× (F64: 8×) the intended offset** and returns wrong numbers or reads past the end.

This only triggers above `#BULK_THRESHOLD = 64` (`index.ts:1700`). That is exactly why the
failure is _intermittent and file-dependent_: small models take the per-element `vec.get(i)`
loop and are always correct; the Outer Container assembly crosses 64 and takes the broken
path. It also explains the standalone-vs-server asymmetry — standalone runs one import and
the heap never grows mid-read; the live server has already grown the heap across earlier
files, so the view is stale relative to the data.

**(c) `#bulkF64/#bulkU32/#bulkI32` are the same class of bug on the write side.**
`index.ts:1717-1718` (and 1727-1728, 1737-1738) call `allocBytes` — which can itself grow the
heap — then re-read `this.#module.HEAPU32.buffer`. The comment at `index.ts:1714-1716` shows
the author knew growth was possible here. Reading `.buffer` _after_ the call is correct, so
these are safe as written; `#readVector` is the one that is not.

**Why the four applied fixes did not stop it:** all four are real and worth keeping, but none
touch this path. (1) XCAF document close, (2) memory-bounded cache, (3) STEP graph release,
(4) kernel serialization address _retention and interleaving_. This bug is in the **result
marshalling** layer, after OCCT has already succeeded.

**(d) The MCP-SDK concurrency hypothesis is disproven.** `@modelcontextprotocol/server@2.2.0`
serializes strictly: `dist/stdio.mjs:531-547` has a `queue` + `pumping` guard whose `pump()`
does `await processMessage(message)` inside a `while` loop. Requests are never concurrent, so
serialization was never the missing piece — consistent with the owner's observation that the
race fix did not help.

**Two real secondary bugs found while confirming (d), both still worth fixing:**

- **`releaseAll()` never clears `assemblyDocuments_` or `graph_`.** Generated
  `occt/facade/generated/kernel.cpp:2645-2652` clears only `arena_` and resets `nextId_`.
  The `assemblyDocuments_` map (`occt_kernel.h:359`) and `graph_`/`graphShape_`
  (`occt_kernel.h:354-355`) survive. A `releaseAll()` — reachable via
  `OcctKernel[Symbol.dispose]()`/`FinalizationRegistry` at `index.ts:118-125` — leaves
  documents alive while their handles are gone, and `ensureGraph`'s
  `graphShape_.IsSame(shape)` guard (`kernel.cpp:350`) can match a recycled id against a
  stale shape. `nextId_ = 1` makes handle reuse certain, so a stale `graphShape_` can
  silently serve the wrong topology.
- **Per-node `componentShape` handles are leaked.** `xcaf.cpp:303` calls `store(leafShape)`
  for every assembly leaf; `releaseAssembly` (`xcaf.cpp:166-185`) releases only
  `rootShapeId`. Nothing releases the per-node handles. Each evicted assembly therefore
  leaks one arena entry per component — the retention that makes failure likelier on the
  **3rd or later** file.

**Discriminating experiments** (cheap, in priority order):

1. Patch `index.ts:1764` to `Math.floor(heapPtr(vec.dataPtr()) / HeapArray.BYTES_PER_ELEMENT)`
   and re-run the failing sequence. This is a one-line change and should be decisive.
2. Assert `this.#module.HEAPU32.buffer === this.#module.HEAPU8.buffer` before and after each
   kernel call; log when it changes. Confirms growth mid-operation.
3. Log `arena_.size()` and `assemblyDocuments_.size()` at each import — the uncommitted
   instrumentation in `occt/facade/src/xcaf.cpp:145-160` already does this. Monotonic growth
   across files confirms (d)'s leak.
4. Force `#BULK_THRESHOLD` to a huge value (per-element path only) and re-run. If the failure
   vanishes, the bulk path is confirmed as the sole cause.

## 2. Architectural assessment

The shape is broadly right and should not be abandoned. The **singleton kernel is correct**:
one WASM instance owns one 4 GiB linear memory, and OCCT objects cannot be shared across
instances. `StepModelStore`'s serialize-everything discipline (`model-store.ts:579-598`) is
the right call for a substrate that is not reentrant, and the lazy-promise memoization per
model (`model-store.ts:109-131`) is genuinely good — it makes each import happen once.

Three structural problems:

- **The hand-written binding layer is where the bugs are.** `index.ts` is 1,940 lines of
  manual marshalling, and every heap/vector/handle rule is re-implemented by hand. The
  `dataPtr` bug and the `releaseAll` gap are both "someone must remember" invariants. This is
  the highest-defect-density code in the repo and the best candidate for deletion.
- **`maxModels = 1` (`model-store.ts:523`) is a workaround, not a policy.** It makes `diff`
  thrash: `compareStepFiles` (`domain/compare.ts:4-5`) nests `withStepModel` for A and B, so
  B's acquisition calls `evictAll()` (`model-store.ts:551`) and disposes A _while A's callback
  is still running_. This is a real correctness bug on the current code path, independent of
  the marshalling bug.
- **Ownership of kernel handles is implicit.** `AssemblyTreeNode.componentShape` is a raw
  `number` (`model-store.ts:58`) that escapes into tool results; nothing tracks its lifetime,
  which is how the per-node leak went unnoticed.

## 3. Concrete simplifications (value/effort)

1. **Delete the bulk path; use per-element `get()`.** Highest value, lowest effort. Fixes the
   bug by removal, deletes `#readVector`'s typed-array branch, `#bulkF64/U32/I32`,
   `dataPtr` from all three vector types, and the codegen that emits it
   (`emitter.rs:269-290`). The measured ~50% win (`index.ts:1697-1699`) is worth far less than
   the defect class it introduced. Restore it later behind a heap-growth guard if profiling
   justifies it.
2. **Make `releaseAll()` clear all kernel-owned state.** Move `assemblyDocuments_`, `graph_`,
   `graphShape_` cleanup into it, and stop resetting `nextId_` to 1 (or bump a generation
   counter) so stale handles cannot silently alias.
3. **Release per-node handles in `releaseAssembly`.** Either store the node handles in a
   vector keyed by `rootHandle` and erase them there, or drop `componentShape` from the arena
   entirely and resolve components by index into `getSubShapes(rootShape, 'solid')`.
4. **Make `diff` a single acquisition.** Give `run()` a multi-path form so `compareStepFiles`
   acquires A and B once, instead of nesting.
5. **Replace the hand-written layer with generated bindings.** Keep the Rust codegen and
   extend it to emit the TypeScript wrapper alongside `bindings.cpp`, so heap-offset and
   vector-lifetime rules live in one audited place. This is the real answer to "minimal custom
   code to maintain", and it preserves the zero-install `npx` constraint (the `.wasm` stays a
   build artifact in the package).

## 4. Single most valuable next action

**Fix `src/occt-wasm/index.ts:1764` to divide `dataPtr()` by `BYTES_PER_ELEMENT`** — or delete
the bulk branch entirely per simplification 1 — then re-run the exact live-server sequence that
fails on the 3rd file. Everything else in this report is secondary until that one line is
tested; it is the only hypothesis that explains all three observations at once (intermittent,
file-size-dependent, absent standalone).
