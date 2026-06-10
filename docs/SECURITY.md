# Security

## Security Posture

CAD files are sensitive engineering IP and should be treated as untrusted input.

The current product is local-first and read-only, which reduces risk, but the server still parses complex file formats and exposes tools to an LLM host. Keep the tool surface narrow and deterministic.

## Current Local Mode

Current assumptions:

- User provides local file paths.
- MCP server runs on the user's machine or controlled development environment.
- Tools read STEP files and return structured analysis.
- No CAD edits are performed.
- No network upload is required by the CAD analysis path.

Local precautions:

- Only point tools at files the user intends to analyze.
- Avoid passing arbitrary host paths from untrusted LLM-generated text without user intent.
- Treat import failures as expected, not exceptional system failures.
- Do not log raw STEP contents.

## MCP Guardrails

Tool design rules:

- Use strict input schemas.
- Keep tools read-only.
- Return structured data, not raw kernel handles.
- Do not expose arbitrary code execution.
- Do not expose raw OCCT command execution.
- Include limitations so the LLM does not overstate findings.

LLM behavior rules:

- Do not invent measurements.
- Do not claim manufacturability or compliance without evidence.
- Preserve uncertainty from tool outputs.
- Recommend engineer review for consequential decisions.

## Future Hosted Mode

If this server becomes hosted or processes uploaded files, add a hardened intake path:

- allowlist file extensions and supported formats
- validate MIME hints and file signatures where practical
- size-limit uploads
- store uploads outside any public webroot
- compute file hashes
- scan files before processing
- parse in isolated workers
- cap CPU, memory, file size, and wall-clock time
- disable worker network access by default
- run workers as non-root
- keep processing libraries patched

## Future Enterprise Mode

Enterprise deployments should add:

- tenant isolation
- per-user authorization
- audit logs for tool calls
- retention policies
- signed URLs for artifacts
- admin allowlists for tools and backends
- configurable raw-CAD retention/deletion
- option for local-only or tenant-only processing
- SBOM/signing for distributed server packages

## Sensitive Outputs

Even structured outputs may reveal design information.

Examples:

- file names
- product names
- dimensions
- volumes
- screenshots or meshes
- feature counts
- supplier/process notes

For hosted use, treat reports and viewer artifacts as sensitive artifacts with the same access controls as source CAD.

## Report Language

Reports should include compliance-safe wording when appropriate:

```text
This is an automated design review aid. Findings are based on available STEP geometry and current tool capabilities. Engineering judgment, drawings, supplier confirmation, and native CAD/PMI should be used for final decisions. Absence of findings does not guarantee manufacturability or compliance.
```
