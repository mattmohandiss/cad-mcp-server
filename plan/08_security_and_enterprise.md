# 08 — Security and Enterprise Requirements

## Security posture

This product handles sensitive engineering IP. Trust is central.

Positioning:

> "CAD can stay local or inside the customer's tenant. Copilot receives structured engineering findings, not raw design files, unless policy allows otherwise."

## Data sensitivity levels

### Level 0 — Public/reference data

Examples:

- generic CAD tutorials
- public manufacturing guidelines
- product documentation

Handling:

- safe for cloud indexing

### Level 1 — Company standards

Examples:

- internal design guides
- drawing templates
- preferred fastener lists

Handling:

- indexed or federated depending on customer policy
- citations required

### Level 2 — Project engineering data

Examples:

- STEP files
- drawings
- BOMs
- supplier quotes

Handling:

- customer-controlled storage preferred
- audit all access
- avoid training usage
- enforce user permissions

### Level 3 — Sensitive CAD/native files

Examples:

- SLDPRT/SLDASM
- unreleased designs
- regulated products
- defense/aerospace/medical-device designs

Handling:

- local or tenant-only processing
- no raw file export by default
- encryption at rest
- strict audit trails
- optional air-gapped deployment

## Permission model

Entities:

- tenant
- user
- project
- file
- twin
- analysis
- report
- local device

Permission checks:

- can user access file?
- can user run analysis?
- can user view generated report?
- can user export report?
- can user use local companion?
- can user apply native CAD changes?

## Authentication

MVP:

- local dev auth
- API key for test deployments

Enterprise:

- Microsoft Entra ID
- OAuth 2.0
- per-user authorization
- admin consent
- tenant isolation
- conditional access compatible

## Audit log

Every tool call should record:

```json
{
  "timestamp": "2026-06-04T12:00:00Z",
  "tenant_id": "tenant_123",
  "user_id": "user_123",
  "tool": "analyze_cad_file",
  "input_refs": ["file_123"],
  "output_refs": ["analysis_123", "report_123"],
  "file_hashes": ["sha256..."],
  "status": "success",
  "duration_ms": 18342
}
```

Do not log raw CAD contents or sensitive prompts unless customer policy allows it.

## Safety rules for AI

The agent must not:

- invent measurements
- invent company standards
- silently modify CAD
- claim a part is safe/certified/manufacturable without evidence
- bypass permissions
- expose one user's project data to another user
- use raw CAD in prompts when structured findings are enough

The agent should:

- call tools for geometry claims
- cite company standards
- preserve uncertainty
- include assumptions
- recommend engineer review
- separate findings from suggestions

## Local-first modes

### Report-only sync

Local companion sends only:

- findings JSON
- screenshots if allowed
- report
- no raw CAD

### Metadata-only sync

Local companion sends only:

- summary
- issue count
- severity
- no screenshots
- no geometry

### Full sync

Local companion uploads:

- CAD file
- twin mesh
- screenshots
- report

Only enable when policy allows.

## Deployment models

| Model | CAD leaves workstation? | Ease of adoption | Enterprise trust |
|---|---:|---:|---:|
| SaaS file upload | Yes | High | Medium |
| Customer Azure tenant | No, if configured | Medium | High |
| Local companion report-only | No raw CAD | Medium/Low | High |
| Fully local | No | Low | Very high |

## Admin controls

Admins should be able to configure:

- allowed file types
- allowed manufacturing rule packs
- whether raw CAD upload is allowed
- whether screenshots are allowed
- whether local companion can sync reports
- whether native CAD edits are enabled
- which company data sources are connected
- retention policies
- export policies

## Compliance-friendly report language

Reports should include:

- "This is an automated design review aid."
- "Findings are based on available geometry and configured rules."
- "Engineering judgment and supplier confirmation are required."
- "Absence of findings does not guarantee manufacturability."

## Threats to consider

- prompt injection through company documents
- malicious CAD files
- leaking sensitive file names/metadata
- cross-tenant data exposure
- tool over-permissioning
- unapproved CAD export
- hallucinated engineering claims
- unsafe automated CAD modification

## Security MVP checklist

- file hash every upload
- tenant/user isolation
- structured tool outputs
- no CAD write-back
- report disclaimers
- basic audit logs
- input validation
- signed URLs with expiration
- delete original file after processing if configured
