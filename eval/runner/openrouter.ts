/**
 * OpenRouter API client.
 *
 * OpenRouter exposes an OpenAI-compatible chat completions endpoint:
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer $OPENROUTER_API_KEY
 *   Content-Type: application/json
 *
 * We use the standard tool-calling format (the same as OpenAI's
 * function-calling). The cad-mcp tool definitions in
 * `src/schemas/tool-schemas.ts` are translated to OpenAI's
 * `tools: [{ type: "function", function: { name, description, parameters } }]`
 * shape on the way out, and the `tool_calls` array is read back on
 * the way in.
 */

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-encoded per OpenAI's contract
  };
};

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
};

export type ChatResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
  }
}

export async function chatCompletion(
  apiKey: string,
  request: ChatRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 60_000;
  const timer = setTimeout(() => controller.abort(), timeout);
  // Compose with any externally provided signal.
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/cad-mcp-server',
        'X-Title': 'cad-mcp-server eval',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new OpenRouterError(
        `OpenRouter returned ${response.status}: ${response.statusText}`,
        response.status,
        body,
      );
    }
    return (await response.json()) as ChatResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translate a Zod-style tool definition (with .describe() on every
 * field) into OpenAI's tool-calling shape. The translation is
 * mechanical: walk the Zod schema's `_def` to extract field metadata.
 *
 * Note: the cad-mcp schemas in src/schemas/tool-schemas.ts are
 * intentionally designed to be OpenAI-compatible (no `oneOf`
 * discriminators, no `$ref`, all objects `.strict()`). This
 * translation is therefore safe to do at runtime without a full
 * JSON Schema visitor.
 */
export function zodToOpenAITool(
  name: string,
  description: string,
  zodSchema: { shape: Record<string, z.ZodType> },
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: zodSchemaToJsonSchema(zodSchema.shape),
    },
  };
}

import { z } from 'zod';

function zodSchemaToJsonSchema(shape: Record<string, z.ZodType>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodFieldToJsonSchema(value);
    if (!isOptionalZod(value)) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function isOptionalZod(zodType: z.ZodType): boolean {
  // Zod stores optionality in the typeName ("ZodOptional") or via
  // an inner "ZodDefault" wrapper. Check both via the .isOptional()
  // helper, falling back to typeName inspection.
  if (typeof zodType.isOptional === 'function') {
    return zodType.isOptional();
  }
  const def = zodType._def as unknown as { typeName?: string };
  return def?.typeName === 'ZodOptional' || def?.typeName === 'ZodDefault';
}

function zodFieldToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
  const def = zodType._def as unknown as { typeName?: string };
  const typeName = def?.typeName ?? '';

  if (typeName === 'ZodOptional' || typeName === 'ZodDefault') {
    const inner = (zodType as unknown as { _def: { innerType: z.ZodType } })._def.innerType;
    return zodFieldToJsonSchema(inner);
  }

  if (typeName === 'ZodString') {
    return { type: 'string', description: extractDescription(zodType) };
  }
  if (typeName === 'ZodNumber') {
    return { type: 'number', description: extractDescription(zodType) };
  }
  if (typeName === 'ZodBoolean') {
    return { type: 'boolean', description: extractDescription(zodType) };
  }
  if (typeName === 'ZodEnum') {
    const values = (zodType as unknown as { _def: { values: readonly string[] } })._def.values;
    return { type: 'string', enum: values, description: extractDescription(zodType) };
  }
  if (typeName === 'ZodArray') {
    const inner = (zodType as unknown as { _def: { type: z.ZodType } })._def.type;
    return { type: 'array', items: zodFieldToJsonSchema(inner), description: extractDescription(zodType) };
  }
  if (typeName === 'ZodObject') {
    const shape = (zodType as unknown as { shape: Record<string, z.ZodType> }).shape;
    return zodSchemaToJsonSchema(shape);
  }
  if (typeName === 'ZodLiteral') {
    const value = (zodType as unknown as { _def: { value: unknown } })._def.value;
    return { type: typeof value === 'number' ? 'number' : 'string', enum: [value] };
  }

  return { description: extractDescription(zodType) };
}

function extractDescription(zodType: z.ZodType): string | undefined {
  const def = zodType._def as unknown as { description?: string };
  return def?.description ?? undefined;
}
