# 07 — Local Companion App

## Purpose

The local companion unlocks live CAD context while keeping sensitive CAD processing on the engineer's workstation.

It should be optional, not required for the first version.

## Why optional

Many enterprise engineering workstations are locked down. Users may not have permission to install software. IT approval can be slow.

So the MVP should work without it through file-based analysis and Copilot integration.

## Companion capabilities

### Phase 1

- detect installed CAD applications
- detect active CAD process
- read CAD version if possible
- export active document as STEP/mesh/screenshot
- run local analysis
- send structured results to remote gateway
- no write-back

### Phase 2

- selected face/feature awareness
- active assembly context
- local twin sync
- local report generation
- local 3D viewer

### Phase 3

- propose edits in twin
- prepare native CAD patch
- apply approved changes through CAD API
- drawing/BOM updates

## Architecture

```text
CAD Application
  ↓
CAD Connector / Add-in
  ↓
Local Companion Service
  ├─ CAD API Adapter
  ├─ Export Manager
  ├─ Local Twin Store
  ├─ Local Analysis Engine
  ├─ Local Renderer
  └─ Secure Gateway Client
        ↓ outbound only
Remote MCP Gateway
        ↓
Microsoft Copilot
```

## Why outbound connection

Do not require inbound network access to the engineer's workstation.

The companion should establish an outbound connection to the gateway:

- WebSocket
- long polling
- message queue
- device-paired HTTPS polling

This is more firewall-friendly.

## Pairing flow

1. User opens local companion.
2. User signs in with company identity.
3. Companion registers device with gateway.
4. Gateway links device to user.
5. Copilot can now ask: "Is a companion online for this user?"
6. Requests route to the paired device.

## Security rules

- No CAD file upload unless policy allows it.
- Default to returning structured findings, not raw CAD.
- Ask for local approval before exporting sensitive files.
- Always require explicit approval for native CAD modifications.
- Log tool calls and file hashes.
- Allow company admins to disable write-back entirely.

## CAD integrations

### SOLIDWORKS

Potential approaches:

- C# COM automation
- SOLIDWORKS add-in
- macro-based prototype
- Document Manager API for metadata/file inspection

Phase 1 can start with a standalone app that asks user to export STEP manually.

Phase 2 should add native add-in support.

### Fusion / Inventor

Potential approaches:

- Autodesk APIs/add-ins
- export active document
- collect version/context

### NX / Creo

Likely enterprise-heavy. Add only after demand.

## Local storage

Store:

```text
%LOCALAPPDATA%/CadCopilot/
  config.json
  devices/
  twins/
  exports/
  reports/
  logs/
```

Avoid storing more than needed.

## Local service API

The companion should expose a local API internally.

Example endpoints:

```text
GET /health
GET /cad/installed
GET /cad/active-context
POST /cad/export-snapshot
POST /analysis/run
POST /reports/generate
POST /patches/apply-approved
```

Even if the external protocol is MCP, keeping the companion's internal API simple will help.

## MVP local companion

Do not build a full CAD plugin first.

MVP companion:

- Windows desktop/tray app
- user selects a local STEP file
- runs local DFM analysis
- produces report
- optionally syncs only report JSON to gateway

Then add live CAD integration.
