import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";
import type { AgentTurnRequest } from "../types";

const request: AgentTurnRequest = {
  systemPrompt: "system",
  messages: [{ role: "user", content: "Find ferritin" }],
  tools: [
    {
      name: "search_records",
      description: "Search records",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  ],
};

class TestOpenAI extends OpenAIProvider {
  body: any;
  protected override async postJson(_url: string, _headers: Record<string, string>, body: unknown) {
    this.body = body;
    return {
      output: [
        {
          type: "function_call",
          call_id: "call-1",
          name: "search_records",
          arguments: '{"query":"ferritin"}',
        },
      ],
    };
  }
}

class TestAnthropic extends AnthropicProvider {
  body: any;
  protected override async postJson(_url: string, _headers: Record<string, string>, body: unknown) {
    this.body = body;
    return {
      content: [
        {
          type: "tool_use",
          id: "call-1",
          name: "search_records",
          input: { query: "ferritin" },
        },
      ],
    };
  }
}

class TestGemini extends GeminiProvider {
  body: any;
  protected override async postJson(_url: string, _headers: Record<string, string>, body: unknown) {
    this.body = body;
    return {
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "search_records", args: { query: "ferritin" } } }],
          },
        },
      ],
    };
  }
}

class TestOpenRouter extends OpenRouterProvider {
  body: any;
  protected override async postJson(_url: string, _headers: Record<string, string>, body: unknown) {
    this.body = body;
    return {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call-1",
                function: { name: "search_records", arguments: '{"query":"ferritin"}' },
              },
            ],
          },
        },
      ],
    };
  }
}

describe("native provider tools", () => {
  it.each([
    ["openai", new TestOpenAI("key", "model")],
    ["anthropic", new TestAnthropic("key", "model")],
    ["gemini", new TestGemini("key", "model")],
    ["openrouter", new TestOpenRouter("key", "model")],
  ])("normalizes %s tool calls", async (_name, provider) => {
    const result = await provider.runAgentTurn(request);
    expect(result).toMatchObject({
      kind: "tool_calls",
      calls: [{ name: "search_records", arguments: { query: "ferritin" } }],
    });
    expect((provider as any).body.tools).toBeTruthy();
  });
});
