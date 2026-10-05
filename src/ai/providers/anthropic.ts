import { BaseProvider, type CompletionRequest } from "./base";
import { AIProviderError, type AgentTurnRequest, type AgentTurnResult } from "../types";

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";

  async runAgentTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    const messages: any[] = [];
    for (const message of request.messages) {
      if (message.role === "tool") {
        const block = {
          type: "tool_result",
          tool_use_id: message.toolCallId,
          content: message.content,
        };
        const last = messages[messages.length - 1];
        if (last?.role === "user" && last.toolResults === true) last.content.push(block);
        else messages.push({ role: "user", content: [block], toolResults: true });
        continue;
      }
      if (message.role === "assistant") {
        const content: any[] = message.content ? [{ type: "text", text: message.content }] : [];
        for (const call of message.toolCalls ?? []) {
          content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
        }
        messages.push({ role: "assistant", content });
      } else {
        messages.push({ role: "user", content: message.content });
      }
    }
    const headers = {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };
    const body = {
      model: this.model,
      max_tokens: 4096,
      system: request.systemPrompt,
      messages: messages.map(({ toolResults: _, ...message }) => message),
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    };
    const url = "https://api.anthropic.com/v1/messages";
    const data = request.onTextDelta
      ? await this.streamMessage(url, headers, { ...body, stream: true }, request)
      : await this.postJson(url, headers, body, request.signal);
    const calls = (data.content ?? [])
      .filter((block: any) => block.type === "tool_use")
      .map((block: any) => ({
        id: String(block.id),
        name: String(block.name),
        arguments:
          block.input && typeof block.input === "object"
            ? (block.input as Record<string, unknown>)
            : {},
      }));
    const content = (data.content ?? [])
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("");
    if (calls.length) return { kind: "tool_calls", content, calls };
    if (!content)
      throw new AIProviderError("Empty response from Anthropic", undefined, "bad_response");
    return { kind: "message", content };
  }

  /** Rebuilds the Messages API `content` array from the stream's block events. */
  private async streamMessage(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    request: AgentTurnRequest,
  ): Promise<any> {
    const blocks: any[] = [];
    const json: string[] = [];
    await this.postStream(url, headers, body, request.signal, (data) => {
      const event = JSON.parse(data);
      if (event.type === "content_block_start") {
        blocks[event.index] = { ...event.content_block };
        json[event.index] = "";
      } else if (event.type === "content_block_delta") {
        const block = blocks[event.index];
        if (!block) return;
        if (event.delta?.type === "text_delta") {
          block.text = (block.text ?? "") + event.delta.text;
          request.onTextDelta?.(event.delta.text);
        } else if (event.delta?.type === "input_json_delta") {
          json[event.index] += event.delta.partial_json ?? "";
        }
      } else if (event.type === "content_block_stop") {
        const block = blocks[event.index];
        if (block?.type === "tool_use") {
          try {
            block.input = json[event.index] ? JSON.parse(json[event.index]) : {};
          } catch {
            block.input = {};
          }
        }
      } else if (event.type === "error") {
        throw new AIProviderError(
          `anthropic stream error: ${event.error?.message ?? "unknown"}`,
          undefined,
          event.error?.type === "overloaded_error" ? "overloaded" : "unknown",
        );
      }
    });
    return { content: blocks.filter(Boolean) };
  }

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

    const messages = [
      ...(req.history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ];
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
        messages,
      },
      req.signal,
    );

    const text = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    if (!text)
      throw new AIProviderError("Empty response from Anthropic", undefined, "bad_response");
    return text;
  }
}
