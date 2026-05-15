import { z } from 'zod';

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(['stdio', 'sse', 'http']),
  enabled: z.boolean().optional().default(true),
});

export const MCPConfigSchema = z.object({
  servers: z.record(MCPServerConfigSchema),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

/**
 * Parse and validate raw JSON (as parsed object) against the MCP config schema.
 * Throws a ZodError on invalid input.
 */
export function parseConfig(json: unknown): MCPConfig {
  return MCPConfigSchema.parse(json);
}
