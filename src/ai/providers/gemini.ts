import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError, type AgentTurnRequest, type AgentTurnResult } from "../types";

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini";

  async runAgentTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const contents: any[] = [];
    for (const message of request.messages) {
      if (message.role === "tool") {
        const part = {
          functionResponse: {
            name: message.name,
            response: parseToolResult(message.content),
          },
        };
        const last = contents[contents.length - 1];
        if (last?.role === "user" && last.toolResults === true) last.parts.push(part);
        else contents.push({ role: "user", parts: [part], toolResults: true });
        continue;
      }
      if (message.role === "assistant") {
        const parts: any[] = message.content ? [{ text: message.content }] : [];
        for (const call of message.toolCalls ?? []) {
          parts.push({ functionCall: { name: call.name, args: call.arguments } });
        }
        contents.push({ role: "model", parts });
      } else {
        contents.push({ role: "user", parts: [{ text: message.content }] });
      }
    }
    const data = await this.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        contents: contents.map(({ role, parts }) => ({ role, parts })),
        systemInstruction: { parts: [{ text: request.systemPrompt }] },
        generationConfig: { maxOutputTokens: 4096 },
        tools: [
          {
            functionDeclarations: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            })),
          },
        ],
      },
      request.signal,
    );
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts
      .filter((part: any) => part.functionCall)
      .map((part: any, index: number) => ({
        id: `gemini-${Date.now()}-${index}`,
        name: String(part.functionCall.name),
        arguments:
          part.functionCall.args && typeof part.functionCall.args === "object"
            ? (part.functionCall.args as Record<string, unknown>)
            : {},
      }));
    const content = parts.map((part: any) => part.text ?? "").join("");
    if (calls.length) return { kind: "tool_calls", content, calls };
    if (!content)
      throw new AIProviderError("Empty response from Gemini", undefined, "bad_response");
    return { kind: "message", content };
  }

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

function parseToolResult(content: string): Record<string, unknown> {
  try {
    const value = JSON.parse(content);
    return value && typeof value === "object" ? value : { result: value };
  } catch {
    return { result: content };
  }
}
