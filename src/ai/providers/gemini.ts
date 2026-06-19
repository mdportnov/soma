import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError } from "../types";

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini";

  protected async complete(req: CompletionRequest): Promise<string> {
    const parts = req.parts.map((p) =>
      p.type === "text"
        ? { text: p.text }
        : { inline_data: { mime_type: p.doc.mimeType, data: p.doc.base64 } },
    );

    const data = await this.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        contents: [{ role: "user", parts }],
        ...(req.system ? { system_instruction: { parts: [{ text: req.system }] } } : {}),
        generationConfig: { maxOutputTokens: req.maxTokens },
      },
    );

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("");
    if (!text) throw new AIProviderError("Empty response from Gemini", undefined, "bad_response");
    return text;
  }
}
