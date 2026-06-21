# Distribution Plan

## Target Audience

Mechanical design engineers on locked-down Windows workstations. No admin rights. No VS Code. No Node.js. They already use ChatGPT in their browser or Microsoft Copilot in Office.

---

## Core Distribution Artifact

**Single binary** compiled with `bun build --compile`:

```
bun build --compile src/index.ts --outfile cad-mcp-server
```

- Bundles Bun runtime + all JS/TS dependencies + embedded occt-wasm wasm into one executable
- ~50MB, no runtime dependencies, no installer
- Runs in user space — no admin rights needed
- Engineer downloads, double-clicks, done

The binary runs an MCP server on `localhost` with all CAD tools available. The embedded wasm is from a forked occt-wasm with custom facade extensions (cylinder axis data, etc.).

---

## Connection Paths

### 1. ChatGPT (web)

**How it works:**

1. Engineer runs `cad-mcp-server.exe`
2. Binary starts MCP server on `localhost` + auto-starts an embedded Cloudflare Tunnel
3. Prints a one-time URL: `https://xxxx.trycloudflare.com/mcp`
4. Engineer copies URL into ChatGPT Settings → Connectors → Create → paste URL
5. Done. Tools appear in conversation.

**Why this path:**
- ChatGPT is already in the engineer's browser — no new tool to learn
- Cloudflare Tunnel is ephemeral (no persistent account or relay needed)
- No data persists on Cloudflare's infrastructure (tunnel is just a pipe)

**Friction points:**
- Requires ChatGPT Pro/Team/Enterprise (Connectors not available on Plus)
- Tunnel adds ~1 second startup latency
- URL changes each restart (acceptable for individual use)

---

### 2. Microsoft Copilot / Enterprise

**How it works:**

1. **IT deployment**: Admin deploys `cad-mcp-server.exe` via SCCM, Intune, or Group Policy
2. **Service configuration**: Binary runs as a Windows scheduled task or background service on the engineer's machine
3. **Copilot connection**: IT configures the MCP endpoint in Microsoft 365 Copilot Studio or via the Microsoft 365 Agent Store certification pipeline
4. **Engineer experience**: Copilot in Office apps (Teams, Outlook, Word) has CAD tools available — zero config

**Data privacy:**
- The binary runs on-premise, on the engineer's machine
- STEP file data never leaves the local network
- For air-gapped environments: no tunnel, no external network calls at all
- Copilot connects to the local MCP server directly (stdin/stdout or localhost HTTP)

**Certification path:**
- Option A (lightweight): Publish as a Power Platform custom connector for org-internal use
- Option B (full): Microsoft 365 Agent Store certification — automated security scan + manual review. Required for cross-tenant publishing.

**Friction points:**
- IT needs to deploy and configure
- Full certification is a heavyweight process
- Microsoft's MCP certification pipeline is still evolving (June 2026)

---

### 3. Claude Desktop

**How it works:**

1. Engineer downloads `cad-mcp-server.exe`
2. Adds to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cad-mcp": {
      "command": "C:\\path\\to\\cad-mcp-server.exe",
      "args": []
    }
  }
}
```

3. Restart Claude Desktop. Tools appear.

**Why this path:**
- Simplest technical setup — stdio transport, no network, no tunnel
- Fully local, zero data leaves the machine
- Best for development and testing

**Friction points:**
- Requires installing Claude Desktop (less common than ChatGPT for engineers)
- Engineers don't typically use Claude Desktop

---

## Data Privacy Architecture

```
┌─────────────────────────────────────────────────────┐
│                Engineer's Machine                    │
│                                                      │
│  ┌──────────────┐    MCP stdio/HTTP                  │
│  │ Chat Tool     │◄──────────────────┐               │
│  │ (ChatGPT /    │                   │              │
│  │  Copilot /    │                   ▼              │
│  │  Claude)      │          ┌────────────────┐      │
│  └──────┬───────┘           │ cad-mcp-server  │      │
│         │                   │                 │      │
│         │                   │ ┌─────────────┐ │      │
│         │ (tunnel only      │ │ OCCT wasm   │ │      │
│         │  for ChatGPT)     │ │ (forked)    │ │      │
│         │                   │ └─────────────┘ │      │
│         ▼                   │                 │      │
│  ┌──────────┐              │ STEP filesystem │      │
│  │ Tunnel   │              │ access          │      │
│  │ (optional)│             └────────────────┘      │
│  └──────────┘                                      │
└─────────────────────────────────────────────────────┘
```

**Key principles:**
- STEP file data is read from the local filesystem only
- No cloud relay or storage of geometry data
- Tunnel (for ChatGPT path) is ephemeral — no data written to tunnel infrastructure, just bytes in transit
- Enterprise path has no tunnel at all — direct connection via Copilot

---

## Publishing / Discovery

| Channel | Purpose | Effort |
|---------|---------|--------|
| **GitHub Releases** | Primary download | Low — attach binary to release |
| **Smithery** | MCP marketplace discoverability | Low — `npx` install stub |
| **MCP.Directory** | Listing for Claude/Cursor users | Low — one-page form |
| **Microsoft Agent Store** | Enterprise Copilot distribution | High — certification pipeline |

---

## Build Pipeline

```
┌──────────┐    ┌───────────┐    ┌──────────────┐
│ occt-wasm │───▶│ C++ facade│───▶│  .wasm file  │
│ (fork)    │    │ extension │    │  (~4.5MB)    │
└──────────┘    └───────────┘    └──────────────┘
                                        │
┌──────────┐    ┌───────────────┐       │
│ cad-mcp  │───▶│ TypeScript   │◄──────┘
│ source   │    │ MCP server   │
└──────────┘    └───────┬───────┘
                        │
                   bun build --compile
                        │
                        ▼
               ┌──────────────────┐
               │ cad-mcp-server   │
               │ (single binary)  │
               └──────────────────┘
```

The key fork point is `occt-wasm` — everything else (TypeScript MCP server, bun build) is already in place.
