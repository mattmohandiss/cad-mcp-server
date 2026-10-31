import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The MCP Registry validates server.json against its published schema at publish
 * time, which is late and needs the network. `mcp-publisher validate` is the
 * authoritative gate in the release workflow; this test guards the same fields
 * where a failure is cheap and blocks the pull request instead.
 */
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const serverJson = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));

// package.json carries a `git+https://…git` URL; server.json wants the plain form.
const repositoryUrl = packageJson.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');

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
    expect(serverJson.packages[0].transport).toEqual({ type: 'stdio' });
  });

  it('points at the published npm package and repository', () => {
    expect(serverJson.repository.url.replace(/\.git$/, '')).toBe(repositoryUrl);
    expect(serverJson.websiteUrl).toContain(repositoryUrl);
  });
});
