# LLM Eval for cad-mcp-server

The eval suite checks whether real LLMs can use the public CAD MCP tools (`inspect_step`, `query_step`, `diff_step`, `transact_step`) to answer geometry questions with known ground truth.

## Runtime

The runner uses AI SDK v7 with Vercel AI Gateway:

- Model IDs use Gateway `creator/model` format, for example `anthropic/claude-sonnet-4-5`.
- Auth uses `AI_GATEWAY_API_KEY`, or `VERCEL_OIDC_TOKEN` when available.
- Requests are tagged through `providerOptions.gateway` with `cad-mcp-eval`, `scenario:<id>`, and `model:<id>`.
- Gateway generation metadata is looked up with `gateway.getGenerationInfo()` when the response includes a generation ID.
- Scenario frontmatter declares generated STEP files under `files:`; prompts stay path-free.

## Layout

```text
eval/
  runner/
    ai.ts          AI SDK + MCP execution
    config.ts      paths, defaults, Gateway auth loading
    index.ts       CLI entry
    logging.ts     JSON and markdown logs
    reporting.ts   console and summary reporting
    runner.ts      orchestration
    scenarios.ts   scenario discovery and fixture generation
    scoring.ts     schema construction and deterministic scoring
    types.ts       shared eval result types
  scenarios/       scenario.md + generate.py + ground-truth.json per scenario
  generate/        shared CadQuery requirements/venv
tests/eval-logs/   per-run logs, gitignored
```

## CLI

```sh
# Full suite: default models × all scenarios
npx tsx eval/runner/index.ts

# One model
npx tsx eval/runner/index.ts -m openai/gpt-4o-mini

# One scenario
npx tsx eval/runner/index.ts -s basic_volume

# Multiple filters
npx tsx eval/runner/index.ts -m anthropic/claude-sonnet-4-5 -m openai/gpt-4o-mini -s cyl_face_count
```

`just eval` builds the server first, then runs the default suite.

## How It Works

For each `(model, scenario)` pair:

1. Run the scenario `generate.py` into `eval/.work/<scenario-id>/` and refresh `ground-truth.json`.
2. Start the built MCP server over stdio.
3. Append a generated-file manifest to the prompt.
4. Convert MCP tools to AI SDK tools with `mcpClient.tools()`.
5. Call `generateText()` with `gateway(modelId)`, `Output.object({ schema })`, and `stopWhen: isStepCount(max_steps)`.
6. Score the structured output against ground truth with deterministic tolerance rules.
7. Write a JSON result and markdown transcript to `tests/eval-logs/`.

This exercises the same MCP subprocess path a real local client uses; it does not call tool handlers in process.

Generated STEP files are run artifacts. They are not committed.

## Validation

Useful local checks:

```sh
npx tsc --noEmit
npx vitest run src/tests/eval-runner-smoke.test.ts
npx vitest run src/tests/llm-eval-replay.test.ts
```
