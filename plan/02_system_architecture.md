# 02 — System Architecture

## High-level architecture

```text
Microsoft Copilot / Copilot Studio
        ↓
Declarative Agent / MCP Plugin
        ↓
Engineering MCP Gateway
        ↓
Domain Services
  ├─ CAD Processing Service
  ├─ DFM Rules Engine
  ├─ Report Generator
  ├─ Company Knowledge Service
  ├─ Digital Twin Store
  └─ Optional Local Companion Broker
        ↓
Storage + Audit + Admin
```

## Core principle

Copilot should not directly "understand CAD." Copilot should call reliable tools that return structured engineering evidence.

## Main services

### 1. MCP Gateway

Responsibilities:

- expose MCP tools/resources/prompts
- authenticate users
- enforce tenant/company policy
- route requests to domain services
- return structured responses to Copilot
- log tool calls and outputs

Recommended implementation:

- TypeScript/Node or Python
- HTTPS endpoint
- OAuth/Entra integration eventually
- structured JSON schemas for all tools
- strict validation on input/output

### 2. CAD Processing Service

Responsibilities:

- import STEP/STL/DXF/PDF files
- generate neutral geometry representation
- generate meshes/viewer artifacts
- extract measurable features
- create screenshots/renders
- support revision comparisons

Early implementation options:

- OpenCascade / pythonOCC
- FreeCAD headless
- commercial CAD translation library later if needed

### 3. DFM Rules Engine

Responsibilities:

- apply process-specific manufacturing rules
- produce findings with evidence
- map findings to geometry locations
- assign severity/confidence
- suggest fixes

Initial rule pack:

- CNC milling

Later rule packs:

- sheet metal
- additive manufacturing
- injection molding
- casting
- turning
- welding/assembly

### 4. Company Knowledge Service

Responsibilities:

- search company design standards
- retrieve approved part/supplier rules
- cite source documents
- support both indexed and live/federated retrieval

Sources:

- SharePoint
- OneDrive
- Teams files
- PDM/PLM metadata
- supplier PDFs
- company wiki
- approved components catalog

### 5. Report Generator

Responsibilities:

- convert findings into human-readable engineering reports
- include screenshots/annotations
- include assumptions and limitations
- output Markdown/HTML initially
- add PDF later

### 6. Digital Twin Store

Responsibilities:

- store neutral shadow representations of CAD files
- store metadata, features, findings, screenshots, revision history
- enable future what-if/proposal workflows

### 7. Optional Local Companion

Responsibilities:

- run on engineer workstation
- detect active CAD program/version
- export active model
- run local-only analysis when CAD cannot leave machine
- maintain local twin
- apply approved changes later

## Deployment modes

### Mode A — No-install SaaS / cloud

```text
Copilot → Hosted MCP Gateway → Hosted CAD Analyzer → Report
```

Good for:

- fast onboarding
- demo
- smaller companies
- non-sensitive test files

Limitations:

- raw CAD leaves company environment unless deployed in tenant
- no active CAD session context

### Mode B — Private Azure / customer tenant

```text
Copilot → MCP Gateway in Customer Azure → CAD Analyzer → Company Storage
```

Good for:

- enterprise security
- controlled CAD processing
- Microsoft-first sales motion

### Mode C — Hybrid local-first

```text
Copilot → Remote MCP Gateway → Outbound connection → Local Companion → CAD Workstation
```

Good for:

- sensitive CAD IP
- active CAD context
- local processing
- future CAD write-back

### Mode D — Local-only developer mode

```text
Desktop AI Client → Local MCP Server → CAD Analyzer
```

Good for:

- early prototyping
- power users
- proof-of-concept
- not ideal for Microsoft 365 Copilot production

## Recommended build order

1. Remote MCP gateway.
2. File-based CAD analysis.
3. Company standards search.
4. Report generation.
5. Microsoft Copilot agent.
6. Local companion.
7. Digital twin proposals.
8. Approved CAD edits.
