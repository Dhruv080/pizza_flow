// Model catalogue for the admin "Model selection" tab. Plain constants only —
// no env, no secrets, no network code — so it is safe to import into client
// components as well as the server-side OpenRouter helper.
//
// The admin's stored choice (settings.ai_model) overrides OPENROUTER_MODEL,
// which overrides DEFAULT_MODEL. Any OpenRouter slug works via the custom
// field; the list below is just the curated shortlist.

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export interface AiModelOption {
  id: string;
  label: string;
  note: string;
}

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", note: "Fast and inexpensive — the default." },
  { id: "openai/gpt-4o", label: "GPT-4o", note: "Higher quality, higher cost." },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", note: "Strong reasoning and instruction-following." },
  { id: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", note: "Very fast and cheap." },
  { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash", note: "Fast, low cost." },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Open-weight OpenAI model." },
  { id: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", note: "Open-weight alternative." },
];

/** A conservative OpenRouter slug check: "provider/model", no spaces. */
export function isValidModelSlug(slug: string): boolean {
  return /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(slug) && slug.length <= 100;
}
