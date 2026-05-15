export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: Date;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface LanePlan {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
}

export interface Cost {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsdCents: number;
}

export interface UsageEvent {
  sessionId: string;
  providerId: string;
  model: string;
  usage: Cost;
  timestamp: Date;
}
