import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError } from "../types";

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";

  protected async complete(req: CompletionRequest): Promise<string> {
    const content = req.parts.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : p.doc.mimeType === "application/pdf"
          ? {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: p.doc.base64 },
            }
          : {
              type: "image",
              source: { type: "base64", media_type: p.doc.mimeType, data: p.doc.base64 },
            },
    );

    const data = await this.postJson(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      {
        model: this.model,
        max_tokens: req.maxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content }],
      },
    );

    const text = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    if (!text) throw new AIProviderError("Empty response from Anthropic");
    return text;
  }
}
