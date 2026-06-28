# LLM Eval for cad-mcp-server

Empirical data on whether the 4-tool surface (`inspect_step`,
`query_step`, `diff_step`, `transact_step`) actually works in practice
with real LLMs. Generates test STEP files with known ground truth,
asks real LLMs questions via OpenRouter, and compares answers.

## Layout

```
eval/
  runner/
    runner.ts             Multi-model eval runner (MCP subprocess + AI SDK)
    questions.ts          5 questions with ground truth + extractors
    model-registry.ts     3 models via OpenRouter
    index.ts              CLI entry with --model / --question filters
generate/
  generate.py             CadQuery STEP file generator (6 files)
samples/eval-generated/   6 committed STEP files + meta.json ground truth
src/tests/
  ground-truth-verification.test.ts   Kernel matches meta.json
  llm-eval.test.ts                    Vitest wrapper for live eval
  llm-eval-replay.test.ts             Replay from logs (no API cost)
  eval-runner-smoke.test.ts           Plumbing smoke test (no API key needed)
tests/eval-logs/                      Per-run JSON logs (gitignored)
```

## Cost

Full eval (3 models × 5 questions = 15 calls): **~$0.30–0.50**

Breakdown:
- Claude Sonnet 4.5: ~$0.25 (the expensive one)
- GPT-4o-mini: ~$0.02
- Gemini 2.5 Flash: ~$0.03

## When to run evals

### Skip it — unit tests cover you
| Change | Run |
|---|---|
| OCCT kernel or WASM | `just test` (ground-truth-verification) |
| Query engine internals | `just test` (query-engine, measure-aggregate-pipeline) |
| Tool schemas (types only) | `just test` (schema, four-tool-surface) |
| Extractor logic | Replay test (free, no API calls) |

### Run evals selectively
| Change | Minimum viable eval |
|---|---|
| Schema descriptions / system prompt | `-m gpt -q box_volume -q cyl_face_count` (~$0.01) |
| Query engine filter/aggregate | `-m gpt` (cheapest model, ~$0.02) |
| Adding a new measure op | `-m gpt -m sonnet` (cheap + gold standard) |
| Tool surface redesign | Full run once, then replay thereafter |

### Run the full suite
- Before a PR that changes the tool surface
- After any provider/API SDK upgrade
- To regenerate the baseline after schema improvements

## Workflow

```
1. Make changes
2. just test              # Fast feedback (121 tests, no API calls)
3. npx tsx eval/runner/index.ts -m gpt -q box_volume
                          # Quick sanity check (~$0.003)
4. npx tsx eval/runner/index.ts -m sonnet
                          # Gold standard (~$0.25)
5. npx tsx eval/runner/index.ts
                          # Full suite before PR (~$0.30-0.50)
```

Between steps 3-5, iterate on extractors for free:

```
npx vitest run src/tests/llm-eval-replay.test.ts
```

## CLI

```sh
# Quick: cheapest model, one question
npx tsx eval/runner/index.ts -m gpt -q box_volume

# Mid: two models, relevant questions
npx tsx eval/runner/index.ts -m gpt -m gemini -q cyl_face_count -q box_volume

# Full: all models × all questions
npx tsx eval/runner/index.ts
```

Model shortcuts: `sonnet`, `claude`, `gpt`, `gpt4o`, `gemini`, `flash`

## How the runner works

For each (question, model):
1. Start the real MCP server as a subprocess (`StdioClientTransport`)
2. Get the 4 tools via `mcpClient.tools()`
3. `generateText({ model, tools, stopWhen: isStepCount(8) })`
4. AI SDK handles the loop: LLM calls tools → SDK executes via MCP → results fed back → repeat
5. Extract answer from LLM's final text, score against ground truth

This tests the **exact same code path** as Claude Desktop or any real MCP
client — not in-process handler calls.

## Per-run log format

Each (question, model) pair writes a JSON log to `tests/eval-logs/`:
- `text` — LLM's final answer
- `finishReason` — `stop`, `tool-calls`
- `usage` — token counts per step + aggregated
- `steps` — per-step breakdown with `stepTimeMs`, `responseTimeMs`, per-step usage
- `toolCalls` — what the LLM invoked
- `toolResults` — what the MCP server returned (tool outputs)
- `warnings` — provider warnings

Replay re-extracts from these logs at zero cost.

## Current baseline (2026-06-28)

| Model | Pass Rate |
|---|---|
| Claude Sonnet 4.5 | 5/5 (100%) |
| GPT-4o-mini | 3/5 (60%) |
| Gemini 2.5 Flash | 3/5 (60%) |
| **Overall** | **11/15 (73%)** |
