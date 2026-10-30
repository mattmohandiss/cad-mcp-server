import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The MCP Registry validates server.json against its published schema. Its
 * description limit is not enforced by the passport check that runs in CI, so
 * a long description only fails at publish time. Guard the fields the registry
 * cares about here, where the failure is cheap.
 */
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const serverJson = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

describe('server.json registry metadata', () => {
  it('uses a description the registry accepts', () => {
    expect(typeof serverJson.description).toBe('string');
    expect(serverJson.description.length).toBeGreaterThan(0);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
  });

  it('matches the package identity and version', () => {
    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages).toHaveLength(1);
    expect(serverJson.packages[0].identifier).toBe(packageJson.name);
    expect(serverJson.packages[0].version).toBe(packageJson.version);
    expect(serverJson.packages[0].registryType).toBe('npm');
  });

  it('points at the published npm package and repository', () => {
    expect(serverJson.repository.url.replace(/\.git$/, '')).toBe(
      packageJson.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''),
    );
    expect(serverJson.websiteUrl).toContain('github.com/ottonic/cad-mcp-server');
  });
});
