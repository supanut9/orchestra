import { readFile } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { parseConfig } from './config.js';
import type { MCPConfig } from './config.js';
import type { MCPServer, MCPTool } from './types.js';

/**
 * MCPManager manages the lifecycle of MCP servers for a project.
 * All methods are stubs that return mock data and log intent.
 * Real SDK integration (Client / StdioClientTransport) comes in Sprint 1.
 */
export class MCPManager {
  private config: MCPConfig | null = null;
  private servers: Map<string, MCPServer> = new Map();

  /** Load and validate `.orchestra/mcp.json`. */
  async loadConfig(path: string): Promise<MCPConfig> {
    const raw = await readFile(path, 'utf-8');
    const json: unknown = JSON.parse(raw);
    this.config = parseConfig(json);

    // Initialise server stubs from config
    for (const [id, cfg] of Object.entries(this.config.servers)) {
      this.servers.set(id, { id, config: cfg, status: 'stopped' });
    }

    console.log(
      `[MCPManager] loaded ${Object.keys(this.config.servers).length} server(s) from ${path}`,
    );
    return this.config;
  }

  /** Start a server by id (stub). */
  async start(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Unknown server: ${serverId}`);
    console.log(`[MCPManager] starting server: ${serverId}`);
    this.servers.set(serverId, { ...server, status: 'running' });
  }

  /** Stop a server by id (stub). */
  async stop(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Unknown server: ${serverId}`);
    console.log(`[MCPManager] stopping server: ${serverId}`);
    this.servers.set(serverId, { ...server, status: 'stopped' });
  }

  /** Restart a server by id (stub). */
  async restart(serverId: string): Promise<void> {
    await this.stop(serverId);
    await this.start(serverId);
  }

  /** List all known servers. */
  listServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /** List tools exposed by a server (stub — returns mock data). */
  async listTools(serverId: string): Promise<MCPTool[]> {
    this.assertServerExists(serverId);
    console.log(`[MCPManager] listing tools for: ${serverId}`);
    return [
      {
        name: 'stub_tool',
        description: 'Placeholder tool — real tools come in Sprint 1',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  /** Call a tool on a server (stub — returns mock result). */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertServerExists(serverId);
    console.log(`[MCPManager] callTool(${serverId}, ${toolName}, ${JSON.stringify(args)})`);
    return { result: 'stub', id: nanoid() };
  }

  private assertServerExists(serverId: string): void {
    if (!this.servers.has(serverId)) {
      throw new Error(`Unknown server: ${serverId}`);
    }
  }
}
