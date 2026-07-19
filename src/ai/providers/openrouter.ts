import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError, type AgentTurnRequest, type AgentTurnResult } from "../types";

/** OpenRouter aggregator — OpenAI-compatible chat completions endpoint. */
export class OpenRouterProvider extends BaseProvider {
  readonly id = "openrouter";

  async runAgentTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const messages = request.messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          name: message.name,
          content: message.content,
        };
      }
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: message.content || null,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function",
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                })),
              }
            : {}),
        };
      }
      return { role: "user", content: message.content };
    });
    const data = await this.postJson(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Title": "Soma Health Dashboard",
      },
      {
        model: this.model,
        max_tokens: 4096,
        messages: [{ role: "system", content: request.systemPrompt }, ...messages],
        tools: request.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        })),
      },
      request.signal,
    );
    const message = data.choices?.[0]?.message;
    const calls = (message?.tool_calls ?? []).map((call: any) => ({
      id: String(call.id),
      name: String(call.function?.name),
      arguments: parseToolArguments(call.function?.arguments),
    }));
    const content = typeof message?.content === "string" ? message.content : "";
    if (calls.length) return { kind: "tool_calls", content, calls };
    if (!content)
      throw new AIProviderError("Empty response from OpenRouter", undefined, "bad_response");
    return { kind: "message", content };
  }

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

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
