import registryJson from "./model-registry.json";
import { getApiKey } from "./keystore";
import type { AIProvider } from "./types";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { OpenRouterProvider } from "./providers/openrouter";

export type ModelEntry = {
  id: string;
  label: string;
  supports_vision: boolean;
  supports_pdf: boolean;
};

export type ProviderEntry = {
  id: string;
  label: string;
  keyPlaceholder: string;
  models: ModelEntry[];
};

export const modelRegistry: ProviderEntry[] = registryJson.providers;

// ── AI settings (non-secret part; the key itself lives in the OS keychain) ──

export type AiSettings = {
  providerId: string;
  modelId: string;
  /** Free-form model override for forward compatibility. */
  customModel: string;
};

const SETTINGS_KEY = "soma.aiSettings";

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { providerId: "", modelId: "", customModel: "", ...JSON.parse(raw) };
  } catch {
    /* fall through to defaults */
  }
  return { providerId: "", modelId: "", customModel: "" };
}

export function saveAiSettings(s: AiSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function effectiveModelId(s: AiSettings): string {
  return s.customModel.trim() || s.modelId;
}

const constructors: Record<string, new (key: string, model: string) => AIProvider> = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider,
  gemini: GeminiProvider,
  openrouter: OpenRouterProvider,
};

export function buildProvider(providerId: string, apiKey: string, modelId: string): AIProvider {
  const Ctor = constructors[providerId];
  if (!Ctor) throw new Error(`Unknown AI provider: ${providerId}`);
  return new Ctor(apiKey, modelId);
}

/**
 * Returns a configured provider, or null when AI is not set up —
 * callers render the "enable AI in Settings" stub in that case (§5).
 */
export async function getConfiguredProvider(): Promise<AIProvider | null> {
  const settings = loadAiSettings();
  const model = effectiveModelId(settings);
  if (!settings.providerId || !model) return null;
  try {
    const key = await getApiKey(settings.providerId);
    if (!key) return null;
    return buildProvider(settings.providerId, key, model);
  } catch {
    return null;
  }
}
