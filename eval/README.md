# LLM Eval for cad-mcp-server

Empirical data on whether the 4-tool surface (`inspect_step`,
`query_step`, `diff_step`, `transact_step`) actually works in practice
with real LLMs. Generates test STEP files with known design intent
(ground truth), asks real LLMs the same questions via OpenRouter, and
compares the answers.

## Layout

```
eval/
  README.md                  this file
  generate/                  Python: cadquery STEP file generator
    generate.py
    requirements.txt
    .venv/                    created by setup, NOT committed
  ground-truth/              TypeScript: verifier that kernel matches
    verify.test.ts             meta.json (also lives in src/tests/)
  runner/                    TypeScript: multi-model eval runner
    runner.ts                 (planned)
    questions.ts              (planned)
    openrouter.ts             (planned)
    model-registry.ts         (planned)
samples/
  eval-generated/            committed test STEP files + meta.json
    box.step, box.meta.json
    box_with_3_holes.step, ...
    box_with_blind_hole.step, ...
    stepped_cylinder.step, ...
    bracket_v1.step, bracket_v1.meta.json
    bracket_v2.step, bracket_v2.meta.json
src/tests/
  ground-truth-verification.test.ts   verifies the kernel matches meta.json
  llm-eval.test.ts            (planned) vitest wrapper for the runner
tests/eval-logs/              captured conversations per run (gitignored)
```

## One-time setup

The dev shell has Python 3 with pip. CadQuery needs native system
libraries (libGL, libstdc++, libfontconfig, libX11, etc.); the flake's
`python` wrapper script sets `LD_LIBRARY_PATH` to find them.

```sh
# Confirm the dev shell is active
direnv allow

# Verify cadquery loads
python -c "import cadquery; print(cadquery.__version__)"
# (should print "2.8.0" or similar)

# Create the venv and install cadquery
python -m venv eval/generate/.venv
eval/generate/.venv/bin/pip install -r eval/generate/requirements.txt

# NixOS only: replace the venv's bin/python with a wrapper that
# sets LD_LIBRARY_PATH so cadquery-ocp can find its native deps.
# (The bare nixpkgs python is statically linked, so the venv's
# bin/python doesn't inherit the wrapper's env vars.)
# See flake.nix -> pythonWrapper for the list of libraries needed.
```

## Generating the test STEP files

```sh
eval/generate/.venv/bin/python eval/generate/generate.py
```

This writes 6 STEP files + their `meta.json` to
`samples/eval-generated/`. The files are committed so the eval is
reproducible without re-running the generator.

The script is idempotent: same input => same output, so re-running
won't change the committed files unless the generators are edited.

## Verifying the kernel matches ground truth

```sh
npx vitest run src/tests/ground-truth-verification.test.ts
```

This loads each generated STEP file through the OCCT-wasm kernel and
asserts that the kernel's measurements match the expected answers in
the `meta.json`. If this fails, either the generator is wrong or the
kernel binding is wrong. (Both have happened during development.)

## Running the LLM eval (planned)

The runner lives in `eval/runner/` (TS, OpenRouter). It is not yet
implemented; the design is in `.opencode/plans/1782600837708-nimble-knight.md`.

Setup:
1. Set `OPENROUTER_API_KEY` in your environment
2. `npx vitest run src/tests/llm-eval.test.ts`

The test reads the 5 questions × 3 models matrix, runs each through
the OpenRouter API, captures the conversation, and scores against the
ground truth. Results land in `tests/eval-logs/`.

## What this gives us

Per-model pass rate table:
```
Model                    Pass  Tool ✓  Schema ✓  Content ✓
Claude Sonnet             9/10   100%      100%      90%
GPT-4o-mini               8/10   100%       90%      80%
Gemini 2.0 Flash          7/10    90%       80%      80%
─────────────────────────────────────────────────────────
Overall                  24/30   97%      90%      83%
```

A multi-model signal tells us whether the surface is portable across
provider tool-use conventions, or only tuned to one.
