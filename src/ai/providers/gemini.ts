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

    const history = (req.history ?? []).map((m) => ({
      // Gemini names the assistant role "model".
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const data = await this.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        contents: [...history, { role: "user", parts }],
        ...(req.system ? { system_instruction: { parts: [{ text: req.system }] } } : {}),
        generationConfig: { maxOutputTokens: req.maxTokens },
      },
      req.signal,
    );

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
    if (!text) {
      const reason = candidate?.finishReason;
      const blocked = candidate?.finishReason === "SAFETY" || data.promptFeedback?.blockReason;
      if (reason === "MAX_TOKENS") {
        // Thinking models spend the output budget on reasoning first; a too-low
        // cap leaves no room for the actual answer. Not a key/auth problem.
        throw new AIProviderError(
          "Gemini ran out of output tokens before answering (reasoning used the whole budget). Try again or raise the token limit — your key is fine.",
          undefined,
          "bad_response",
        );
      }
      if (blocked) {
        throw new AIProviderError(
          "Gemini blocked this response on content-safety grounds.",
          undefined,
          "bad_response",
        );
      }
      throw new AIProviderError("Empty response from Gemini", undefined, "bad_response");
    }
    return text;
  }
}
