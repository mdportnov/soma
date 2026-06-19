import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError } from "../types";

/** Uses the OpenAI Responses API (supports inline images and PDF files). */
export class OpenAIProvider extends BaseProvider {
  readonly id = "openai";

  protected async complete(req: CompletionRequest): Promise<string> {
    const content = req.parts.map((p) =>
      p.type === "text"
        ? { type: "input_text", text: p.text }
        : p.doc.mimeType === "application/pdf"
          ? {
              type: "input_file",
              filename: p.doc.fileName ?? "document.pdf",
              file_data: `data:application/pdf;base64,${p.doc.base64}`,
            }
          : {
              type: "input_image",
              image_url: `data:${p.doc.mimeType};base64,${p.doc.base64}`,
            },
    );

    const data = await this.postJson(
      "https://api.openai.com/v1/responses",
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        max_output_tokens: req.maxTokens,
        ...(req.system ? { instructions: req.system } : {}),
        input: [{ role: "user", content }],
      },
    );

    const text = (data.output ?? [])
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text)
      .join("");
    if (!text) throw new AIProviderError("Empty response from OpenAI", undefined, "bad_response");
    return text;
  }
}
