import { describe, it, expect } from 'vitest';
import { parseConfig } from './index.js';

describe('mcp-client', () => {
  it('parseConfig accepts a valid config object', () => {
    const result = parseConfig({
      servers: {
        myServer: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-everything'],
          transport: 'stdio',
        },
      },
    });
    expect(result.servers).toHaveProperty('myServer');
    expect(result.servers['myServer']?.transport).toBe('stdio');
  });

  it('parseConfig throws on invalid transport', () => {
    expect(() =>
      parseConfig({
        servers: {
          bad: { command: 'cmd', transport: 'websocket' },
        },
      }),
    ).toThrow();
  });
});
