// Single source of truth for the advertised server identity and MCP protocol.
export const SERVER_NAME = 'cad-mcp-server';
export const PROTOCOL_VERSION = '2026-07-28';

// Tool, resource, and prompt sets are static for a given build, so clients may
// cache the catalogs (SEP-2549) and no list-changed notifications are emitted.
export const CACHE_TTL_MS = 3_600_000;
