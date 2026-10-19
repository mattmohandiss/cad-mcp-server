// Single source of truth for the advertised server identity.
export const SERVER_NAME = 'cad-mcp-server';

// Tool, resource, and prompt sets are static for a given build, so clients may
// cache the catalogs (SEP-2549) and no list-changed notifications are emitted.
export const CACHE_TTL_MS = 3_600_000;
