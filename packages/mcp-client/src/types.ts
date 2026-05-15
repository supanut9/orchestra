import type { z } from 'zod';
import type { MCPServerConfigSchema } from './config.js';

export type MCPTransport = 'stdio' | 'sse' | 'http';

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export type MCPServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface MCPServer {
  id: string;
  config: MCPServerConfig;
  status: MCPServerStatus;
  error?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}
