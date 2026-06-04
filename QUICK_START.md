# Quick Reference: CAD MCP Server

## Setup

```bash
just setup
just build
```

## Run Tests

```bash
just test
```

## Start the MCP Server

```bash
npm start
```

## Configuration

**File**: `opencode.json` in project root  
**Status**: Created and verified  
**Scope**: Project-level (this directory only)

## Available Tools

- `cad-mcp-server_analyze_step_file` → Get geometry info
- `cad-mcp-server_list_bodies` → List bodies with properties  
- `cad-mcp-server_extract_edges` → Analyze edges

## Test Prompts

1. **Single tool**: "Analyze `samples/NIST-PMI-STEP-Files/AP203 geometry only/nist_ftc_11_asme1_rb.stp`."
2. **Multiple tools**: "Do a complete analysis of that STEP file: analyze, list bodies, and extract edges."
3. **Error test**: "Analyze `/nonexistent/file.step`."

## Verify Success

- [ ] `opencode` command works
- [ ] MCP server initializes (no errors)
- [ ] Claude can see the tools
- [ ] Tool calls work and return data
- [ ] Results are summarized by Claude

## Files

| File | Purpose |
|------|---------|
| `opencode.json` | Integration config |
| `dist/index.js` | Compiled MCP server |
| `samples/dummy.step` | MCP plumbing fixture, not real geometry |

## To Disable After Testing

Option 1: Delete the file
```bash
rm opencode.json
```

Option 2: Disable without deleting
```json
{
  "mcp": {
    "cad-mcp-server": {
      "enabled": false
    }
  }
}
```

## Server Status

Built  
Configured  
Verified to start  
Ready for MCP testing

---

**Next**: Start an MCP client from the project root and ask it to analyze one of the real STEP files under `samples/NIST-PMI-STEP-Files/`.
