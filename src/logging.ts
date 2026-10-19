import pino from 'pino';
import { SERVER_NAME } from './identity.js';

// Structured server logging. pino writes newline-delimited JSON to stderr (fd 2);
// stdout is the MCP stdio channel and must stay clean. Secret-like fields are
// redacted. Environment:
//   MCP_LOG_LEVEL  debug|info|warn|error (default info)
//   MCP_LOG_FORMAT json|human (default json)
//   MCP_LOG_COLOR  0 disables color in human format
//   MCP_TRACE_ID / MCP_TRACE_RUN_ID  correlation fields added to every record
export const logger = pino(
  {
    name: SERVER_NAME,
    level: process.env.MCP_LOG_LEVEL ?? 'info',
    base: {
      service: SERVER_NAME,
      traceId: process.env.MCP_TRACE_ID,
      runId: process.env.MCP_TRACE_RUN_ID,
    },
    redact: {
      paths: [
        'apiKey',
        'authorization',
        'token',
        'password',
        'secret',
        '*.apiKey',
        '*.authorization',
        '*.token',
        '*.password',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
  },
  pino.destination(2),
);

function paint(code: string, value: string): string {
  return process.env.MCP_LOG_COLOR === '0' ? value : `\u001b[${code}m${value}\u001b[0m`;
}

function human(event: string, fields: Record<string, unknown>, message?: string) {
  const tool = typeof fields.tool === 'string' ? fields.tool : undefined;
  const duration = typeof fields.durationMs === 'number' ? ` (${fields.durationMs}ms)` : '';
  const error = typeof fields.error === 'string' ? `: ${fields.error}` : '';
  if (event === 'tool.completed')
    return `${paint(fields.isError ? '31' : '32', `[${SERVER_NAME}] [${fields.isError ? 'error' : 'ok'}]`)} ${paint('33', tool ?? 'tool')}${duration}`;
  if (event === 'tool.failed')
    return `${paint('31', `[${SERVER_NAME}] [fail]`)} ${paint('33', tool ?? 'tool')}${duration}${error}`;
  if (event === 'server.started') {
    const tools = fields.tools !== undefined ? ` tools=${fields.tools}` : '';
    return paint('36', `[${SERVER_NAME}] ready`) + tools;
  }
  return `[${SERVER_NAME}] ${event}${message ? ` ${message}` : ''}`;
}

/**
 * Emit one structured event. The level is derived from the fields: `error` or
 * `isError: true` logs at warn, everything else at info. `tool.started` is
 * suppressed in the human format because it is pure noise there.
 *
 * @param event - dotted event name, e.g. `tool.completed`
 * @param fields - structured fields (redacted before writing)
 * @param message - optional human message
 */
export function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
  message?: string,
): void {
  if (process.env.MCP_LOG_FORMAT === 'human') {
    if (event === 'tool.started') return;
    process.stderr.write(`${human(event, fields, message)}\n`);
    return;
  }
  if (fields.error !== undefined || fields.isError === true)
    logger.warn({ event, ...fields }, message);
  else logger.info({ event, ...fields }, message);
}
