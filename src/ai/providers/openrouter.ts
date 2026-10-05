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
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "X-Title": "Soma Health Dashboard",
    };
    const body = {
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
    };
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const data = request.onTextDelta
      ? await this.streamCompletion(url, headers, { ...body, stream: true }, request)
      : await this.postJson(url, headers, body, request.signal);
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

  /** Accumulates chat-completion deltas (text and indexed tool-call fragments) into one message. */
  private async streamCompletion(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    request: AgentTurnRequest,
  ): Promise<any> {
    let content = "";
    const calls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    await this.postStream(url, headers, body, request.signal, (data) => {
      const chunk = JSON.parse(data);
      if (chunk.error) {
        throw new AIProviderError(
          `openrouter stream error: ${chunk.error.message ?? "unknown"}`,
          undefined,
          "unknown",
        );
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        request.onTextDelta?.(delta.content);
      }
      for (const part of delta.tool_calls ?? []) {
        const index = typeof part.index === "number" ? part.index : calls.length;
        const call = (calls[index] ??= { id: "", function: { name: "", arguments: "" } });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        const args = part.function?.arguments;
        if (typeof args === "string") call.function.arguments += args;
        else if (args && typeof args === "object") call.function.arguments = JSON.stringify(args);
      }
    });
    return {
      choices: [{ message: { content, tool_calls: calls.filter(Boolean) } }],
    };
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
