import pkg from '../package.json' with { type: 'json' };

export const CAD_RESPONSE_SCHEMA_VERSION = '0.4' as const;

export const CAD_MCP_SERVER_VERSION = pkg.version;
