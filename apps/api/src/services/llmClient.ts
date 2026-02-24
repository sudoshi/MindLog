// =============================================================================
// MindLog API — Provider-agnostic LLM client
//
// Dispatches to Anthropic (cloud) or Ollama (local) based on AI_PROVIDER env.
// Ollama uses the OpenAI-compatible API at /v1, enabling local models like
// MedGemma for demo environments with zero cloud cost and no BAA requirement.
// =============================================================================

import { config } from '../config.js';

export interface LlmResult {
  text:         string;
  inputTokens:  number;
  outputTokens: number;
  modelId:      string;
  provider:     'anthropic' | 'ollama';
}

export interface CompletionOptions {
  maxTokens?:   number;
  temperature?: number;
  jsonMode?:    boolean;
}

export interface ChatMessage {
  role:    'user' | 'assistant';
  content: string;
}

/**
 * Send a prompt to the configured LLM provider and return the completion.
 */
export async function generateCompletion(
  prompt:  string,
  options: CompletionOptions = {},
): Promise<LlmResult> {
  const { maxTokens = 1024, temperature = 0.3, jsonMode = false } = options;

  if (config.aiProvider === 'ollama') {
    return runOllama(prompt, maxTokens, temperature, jsonMode);
  }
  return runAnthropic(prompt, maxTokens, temperature);
}

/**
 * Send a multi-turn conversation to the configured LLM provider.
 * Used for interactive AI assistant chat on the clinician dashboard.
 */
export async function generateChat(
  systemPrompt: string,
  messages:     ChatMessage[],
  options:      CompletionOptions = {},
): Promise<LlmResult> {
  const { maxTokens = 1024, temperature = 0.3 } = options;

  if (config.aiProvider === 'ollama') {
    return runOllamaChat(systemPrompt, messages, maxTokens, temperature);
  }
  return runAnthropicChat(systemPrompt, messages, maxTokens, temperature);
}

/**
 * Compute approximate cost in cents. Ollama is always 0 (local inference).
 */
export function computeCostCents(result: LlmResult): number {
  if (result.provider === 'ollama') return 0;
  // Anthropic claude-sonnet pricing: ~$3/1M input, ~$15/1M output
  return Math.round(
    (result.inputTokens * 3 + result.outputTokens * 15) / 10_000,
  );
}

// ---------------------------------------------------------------------------
// Anthropic path
// ---------------------------------------------------------------------------

async function runAnthropic(
  prompt:      string,
  maxTokens:   number,
  temperature: number,
): Promise<LlmResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const message = await client.messages.create({
    model:       config.anthropicModel,
    max_tokens:  maxTokens,
    temperature,
    messages:    [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';

  return {
    text,
    inputTokens:  message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    modelId:      config.anthropicModel,
    provider:     'anthropic',
  };
}

// ---------------------------------------------------------------------------
// Ollama path (OpenAI-compatible /v1 endpoint)
// ---------------------------------------------------------------------------

async function runOllama(
  prompt:      string,
  maxTokens:   number,
  temperature: number,
  jsonMode:    boolean,
): Promise<LlmResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    baseURL: `${config.ollamaBaseUrl}/v1`,
    apiKey:  'ollama', // Ollama ignores this but the SDK requires it
  });

  const response = await client.chat.completions.create({
    model:       config.ollamaModel,
    max_tokens:  maxTokens,
    temperature,
    messages:    [{ role: 'user', content: prompt }],
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  const text = response.choices[0]?.message?.content ?? '{}';

  return {
    text,
    inputTokens:  response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    modelId:      config.ollamaModel,
    provider:     'ollama',
  };
}

// ---------------------------------------------------------------------------
// Anthropic chat path (multi-turn with system prompt)
// ---------------------------------------------------------------------------

async function runAnthropicChat(
  systemPrompt: string,
  messages:     ChatMessage[],
  maxTokens:    number,
  temperature:  number,
): Promise<LlmResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const message = await client.messages.create({
    model:       config.anthropicModel,
    max_tokens:  maxTokens,
    temperature,
    system:      systemPrompt,
    messages:    messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '';

  return {
    text,
    inputTokens:  message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    modelId:      config.anthropicModel,
    provider:     'anthropic',
  };
}

// ---------------------------------------------------------------------------
// Ollama chat path (OpenAI-compatible, system prompt as first message)
// ---------------------------------------------------------------------------

async function runOllamaChat(
  systemPrompt: string,
  messages:     ChatMessage[],
  maxTokens:    number,
  temperature:  number,
): Promise<LlmResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    baseURL: `${config.ollamaBaseUrl}/v1`,
    apiKey:  'ollama',
  });

  const response = await client.chat.completions.create({
    model:       config.ollamaModel,
    max_tokens:  maxTokens,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';

  return {
    text,
    inputTokens:  response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    modelId:      config.ollamaModel,
    provider:     'ollama',
  };
}
