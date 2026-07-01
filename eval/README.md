# LLM Eval for cad-mcp-server

The eval suite checks whether real LLMs can use the public CAD MCP tools (`inspect_step`, `query_faces`, `query_edges`, `measure_step`, `diff_step`) to answer geometry questions with known ground truth.

## How It Works

1. **Source-driven scenarios.** Each scenario has a `generate.py` (CadQuery script that produces a STEP file), a `ground-truth.json` (expected answer), and a `scenario.md` (prompt with frontmatter). No committed STEP fixtures — all models are generated.

2. **Real MCP subprocess.** The runner spawns the actual MCP server as a child process. No mocks. Tests the real tool surface.

3. **Model-agnostic.** Uses Vercel AI Gateway (`creator/model` format, e.g. `anthropic/claude-sonnet-4-5`). Text parsing from model responses — no `Output.object()` dependency. Works with OpenAI, Anthropic, Google, DeepSeek, and others.

4. **Structured traces.** Every run produces a JSON trace with typed spans (`discovery | measurement | distraction | context | answer`), per-span checks (`argsValid`, `productive`), and component-level scores.

## Layout

```text
eval/
  runner/
    ai.ts          AI SDK + MCP execution
    config.ts      paths, defaults, Gateway auth
    index.ts       CLI entry
    logging.ts     JSON and markdown trace output
    reporting.ts   console reporting with [D/M/W] breakdown
    runner.ts      orchestration
    scenarios.ts   scenario discovery and fixture generation
    scoring.ts     schema construction and deterministic scoring
    types.ts       trace, span, and result types
  scenarios/       scenario.md + generate.py + ground-truth.json per scenario
tests/eval-logs/   per-run traces, gitignored
```

## CLI

```sh
# Targeted scenarios (recommended — cheaper, faster)
npx tsx eval/runner/index.ts -m anthropic/claude-sonnet-4-5 -s thin_walls

# Multiple models and scenarios
npx tsx eval/runner/index.ts -m openai/gpt-4o-mini -m google/gemini-2.5-flash -s basic_volume -s cyl_face_count

# Full suite (pre-release gate)
npx tsx eval/runner/index.ts -m anthropic/claude-sonnet-4-5
```

## Understanding the output

Each run shows a `[D/M/W]` breakdown:

- **D**iscovery: productive query_faces or query_edges calls
- **M**easurement: productive measure_step calls
- **W**aste: irrelevant queries, wrong tools, exploration of unrelated geometry

```text
✓ 100  smallest_fillet  claude-sonnet-4-5  1 call  [D/M/W: 1/0/0]  match (expected=1, got=1)
✗  33  smallest_fillet  gpt-5.5            8 calls [D/M/W: 1/0/6]  no answer produced
```

Claude found the answer in 1 focused call. GPT-5.5 got the data on call 1 but wasted 6 more steps exploring unrelated face types, hitting max_steps without producing an answer.

## Adding Scenarios

1. Create `eval/scenarios/<id>/` with `scenario.md`, `generate.py`, `ground-truth.json`
2. `scenario.md` uses YAML frontmatter: `id`, `field`, `tolerance`, `max_steps`, `files`
3. `generate.py` writes STEP files to `CAD_MCP_EVAL_OUTPUT_DIR`
4. `ground-truth.json` contains the expected answer for the `field`

Scenarios are auto-discovered from the `eval/scenarios/` directory.
