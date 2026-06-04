# 03 — Microsoft Copilot Integration

## Goal

Make the product usable from Microsoft 365 Copilot / Copilot Studio while keeping the architecture compatible with local-first CAD processing later.

## Important Microsoft constraint

Microsoft 365 Copilot plugins/declarative agents generally need to reach MCP/API servers over the internet. A workstation `localhost` server is not enough for production Copilot integration.

Practical implication:

- The Microsoft-facing MCP server should be remote or tenant-hosted.
- The local CAD companion should connect outward to that gateway.
- The gateway routes requests between Copilot and the local companion when needed.

## Integration surfaces

### 1. Microsoft 365 Declarative Agent

Use this for a Microsoft 365 Copilot-native experience.

Agent behavior:

- acts as the engineering assistant
- calls MCP tools for CAD/DFM/company-data tasks
- follows strict rules: no unsupported engineering claims
- cites company docs and tool outputs
- asks for target manufacturing process when missing

Possible agent name:

**Mechanical Design Assistant**

Example user prompts:

- "Review this STEP file for CNC manufacturability."
- "How do I make a threaded hole in SOLIDWORKS 2024?"
- "Does this drawing follow our company standard?"
- "Generate a supplier handoff report."

### 2. MCP plugin

Expose your service as a remote MCP server.

MCP server capabilities:

- tools: analysis and actions
- resources: reports, models, snapshots, company docs
- prompts: reusable workflows

### 3. Copilot Studio

Use Copilot Studio for enterprise pilots where the customer wants to configure their own internal agent.

Good for:

- company-specific deployments
- Power Platform customers
- admin-governed agents
- integrating with business data

### 4. Copilot connectors

Use connectors for company knowledge.

Two patterns:

- **Synced connector**: index stable docs into Microsoft Graph.
- **Federated connector**: retrieve sensitive/live data at query time over MCP.

Recommended split:

| Data type | Connector style |
|---|---|
| CAD tutorials | Synced |
| Company design standards | Synced or federated |
| Supplier capability docs | Synced or federated |
| PLM/PDM live records | Federated |
| Sensitive project CAD data | Federated/local companion |

## Recommended Microsoft-compatible architecture

```text
Microsoft 365 Copilot
  ↓
Declarative Agent
  ↓
Remote MCP Gateway
  ↓
Engineering Services
  ├─ CAD analysis
  ├─ DFM rules
  ├─ company knowledge
  ├─ reports
  └─ local companion broker
```

## Authentication model

MVP:

- API key or simple tenant token for internal testing.

Enterprise:

- Microsoft Entra ID OAuth.
- Per-user authorization.
- Tenant admin approval.
- Audit logs per tool call.
- Optional on-behalf-of flow for accessing user-permissioned company data.

## Example tool call flow: file-based CAD review

```text
User:
  "Review this STEP file for CNC manufacturability."

Copilot:
  Calls analyze_cad_file(file_id, process="cnc_milling")

MCP Gateway:
  Authenticates user.
  Fetches file from approved location or receives upload reference.
  Sends file to CAD Processing Service.

CAD Processing Service:
  Parses STEP.
  Extracts geometry/features.
  Generates screenshots/mesh.

DFM Engine:
  Applies CNC rules.
  Produces findings.

Report Generator:
  Produces Markdown/HTML/PDF report.

Copilot:
  Summarizes top risks and links report.
```

## Example tool call flow: live CAD context

```text
User:
  "Analyze the part I have open."

Copilot:
  Calls analyze_current_part()

MCP Gateway:
  Checks if user has paired local companion.

Local Companion:
  Receives request through outbound connection.
  Snapshots active CAD model.
  Runs local analysis.
  Returns structured findings and screenshots.

Copilot:
  Presents summary and report.
```

## Agent instructions sketch

The declarative agent should be instructed:

```text
You are a mechanical design assistant for engineers.
Use tools whenever the question requires CAD geometry, manufacturing checks, company standards, supplier capabilities, or file inspection.
Never invent measurements, model properties, company rules, or software-version-specific command paths.
When tool results include uncertainty, preserve that uncertainty.
Prefer concise engineering recommendations with evidence.
For manufacturability findings, include: risk, evidence, why it matters, suggested fix, and confidence.
```

## Product packaging

Start with:

- Microsoft 365 Copilot agent
- remote MCP server
- file-based tools
- admin-configurable knowledge sources

Add later:

- local companion
- native CAD add-ins
- MCP Apps 3D viewer widget
- private Azure deployment
