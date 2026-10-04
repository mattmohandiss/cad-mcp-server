import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const [command, stepFile] = process.argv.slice(2);
if (!command || !stepFile) {
  throw new Error('Usage: smoke-packed-cli.mjs <installed-server-command> <step-file>');
}

const transport = new StdioClientTransport({ command: resolve(command), stderr: 'inherit' });
const client = new Client({ name: 'cad-mcp-packed-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === 'inspect')) {
    throw new Error('Packed server did not advertise inspect');
  }

  const result = await client.callTool({
    name: 'inspect',
    arguments: { file_path: resolve(stepFile) },
  });
  if (result.isError) throw new Error(`Packed inspect failed: ${JSON.stringify(result.content)}`);

  const data = result.structuredContent;
  if (typeof data !== 'object' || data === null || !('size' in data)) {
    throw new Error('Packed inspect returned no structured geometry size');
  }
  console.log('Packed CLI MCP inspect smoke test passed');
} finally {
  await client.close();
}
