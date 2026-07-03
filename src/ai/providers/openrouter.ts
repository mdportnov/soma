import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError } from "../types";

/** OpenRouter aggregator — OpenAI-compatible chat completions endpoint. */
export class OpenRouterProvider extends BaseProvider {
  readonly id = "openrouter";

  protected async complete(req: CompletionRequest): Promise<string> {
    const content = req.parts.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : p.doc.mimeType === "application/pdf"
          ? {
              type: "file",
              file: {
                filename: p.doc.fileName ?? "document.pdf",
                file_data: `data:application/pdf;base64,${p.doc.base64}`,
              },
            }
          : {
              type: "image_url",
              image_url: { url: `data:${p.doc.mimeType};base64,${p.doc.base64}` },
            },
    );

    const data = await this.postJson(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Title": "Soma Health Dashboard",
      },
      {
        model: this.model,
        max_tokens: req.maxTokens,
        messages: [
          ...(req.system ? [{ role: "system", content: req.system }] : []),
          ...(req.history ?? []).map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content },
        ],
      },
      req.signal,
    );

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text)
      throw new AIProviderError("Empty response from OpenRouter", undefined, "bad_response");
    return text;
  }
}
