import { describe, expect, it } from "vitest";
import { drainSseEvents } from "./base";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { OpenRouterProvider } from "./openrouter";
import type { AgentTurnRequest } from "../types";

type Ctor = new (
  key: string,
  model: string,
) => {
  runAgentTurn(request: AgentTurnRequest): Promise<unknown>;
};

/** Replays canned SSE payloads through the provider's stream handler. */
function streaming<T extends Ctor>(Base: T, events: unknown[]) {
  return class extends (Base as any) {
    url = "";
    body: any;
    protected async postStream(
      url: string,
      _headers: Record<string, string>,
      body: unknown,
      _signal: AbortSignal | undefined,
      onEvent: (data: string, event: string | null) => void,
    ) {
      this.url = url;
      this.body = body;
      for (const event of events) onEvent(JSON.stringify(event), null);
    }
  } as unknown as new (key: string, model: string) => InstanceType<T> & { url: string; body: any };
}

function request(deltas: string[]): AgentTurnRequest {
  return {
    systemPrompt: "system",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    onTextDelta: (delta) => deltas.push(delta),
  };
}

describe("streaming agent turns", () => {
  it("splits SSE blocks and keeps the unfinished tail", () => {
    const seen: string[] = [];
    const tail = drainSseEvents('event: a\ndata: {"x":1}\n\ndata: [DONE]\n\ndata: {"y"', (data) =>
      seen.push(data),
    );
    expect(seen).toEqual(['{"x":1}']);
    expect(tail).toBe('data: {"y"');
  });

  it("gemini: text deltas and whole function calls", async () => {
    const deltas: string[] = [];
    const Provider = streaming(GeminiProvider, [
      { candidates: [{ content: { parts: [{ text: "Hel" }] } }] },
      { candidates: [{ content: { parts: [{ text: "lo" }] } }] },
      {
        candidates: [
          { content: { parts: [{ functionCall: { name: "list_records", args: { a: 1 } } }] } },
        ],
      },
    ]);
    const provider = new Provider("k", "m");
    const result = await provider.runAgentTurn(request(deltas));
    expect(provider.url).toContain(":streamGenerateContent?alt=sse");
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toMatchObject({
      kind: "tool_calls",
      content: "Hello",
      calls: [{ name: "list_records", arguments: { a: 1 } }],
    });
  });

  it("anthropic: rebuilds text and tool_use input from block deltas", async () => {
    const deltas: string[] = [];
    const Provider = streaming(AnthropicProvider, [
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Ok" } },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "t1", name: "get_record", input: {} },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"entityId":' },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: "3}" },
      },
      { type: "content_block_stop", index: 1 },
    ]);
    const provider = new Provider("k", "m");
    const result = await provider.runAgentTurn(request(deltas));
    expect(provider.body.stream).toBe(true);
    expect(deltas).toEqual(["Ok"]);
    expect(result).toMatchObject({
      kind: "tool_calls",
      content: "Ok",
      calls: [{ id: "t1", name: "get_record", arguments: { entityId: 3 } }],
    });
  });

  it("openai: deltas, then the completed response is parsed as usual", async () => {
    const deltas: string[] = [];
    const Provider = streaming(OpenAIProvider, [
      { type: "response.output_text.delta", delta: "Hi" },
      {
        type: "response.completed",
        response: {
          output: [{ type: "message", content: [{ type: "output_text", text: "Hi" }] }],
        },
      },
    ]);
    const result = await new Provider("k", "m").runAgentTurn(request(deltas));
    expect(deltas).toEqual(["Hi"]);
    expect(result).toEqual({ kind: "message", content: "Hi" });
  });

  it("openrouter: joins indexed tool-call fragments", async () => {
    const deltas: string[] = [];
    const Provider = streaming(OpenRouterProvider, [
      { choices: [{ delta: { content: "A" } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "c1", function: { name: "list_records", arguments: '{"en' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: 'tityType":"weight"}' } }] } },
        ],
      },
    ]);
    const result = await new Provider("k", "m").runAgentTurn(request(deltas));
    expect(deltas).toEqual(["A"]);
    expect(result).toMatchObject({
      kind: "tool_calls",
      calls: [{ id: "c1", name: "list_records", arguments: { entityType: "weight" } }],
    });
  });
});

describe("gemini thought signatures", () => {
  it("are kept on the call and sent back with it next round", async () => {
    const Provider = streaming(GeminiProvider, [
      {
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: "list_records", args: {} }, thoughtSignature: "sig" },
              ],
            },
          },
        ],
      },
    ]);
    const provider = new Provider("k", "m");
    const first = (await provider.runAgentTurn(request([]))) as {
      calls: { id: string; thoughtSignature?: string }[];
    };
    expect(first.calls[0].thoughtSignature).toBe("sig");
    await provider.runAgentTurn({
      ...request([]),
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "", toolCalls: first.calls as never },
        { role: "tool", toolCallId: first.calls[0].id, name: "list_records", content: "{}" },
      ],
    });
    expect(provider.body.contents[1].parts[0]).toMatchObject({ thoughtSignature: "sig" });
  });
});
