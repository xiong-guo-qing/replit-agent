import { Router, type IRouter, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import type Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const MODELS = [
  { id: "gpt-5.2", object: "model", owned_by: "openai" },
  { id: "gpt-5-mini", object: "model", owned_by: "openai" },
  { id: "gpt-5-nano", object: "model", owned_by: "openai" },
  { id: "o4-mini", object: "model", owned_by: "openai" },
  { id: "o3", object: "model", owned_by: "openai" },
  { id: "claude-opus-4-6", object: "model", owned_by: "anthropic" },
  { id: "claude-sonnet-4-6", object: "model", owned_by: "anthropic" },
  { id: "claude-haiku-4-5", object: "model", owned_by: "anthropic" },
];

// ─── OAI Types ──────────────────────────────────────────────────────────────

type OAIContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } };

type OAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OAIMessage = {
  role: string;
  content?: string | OAIContentBlock[] | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
  name?: string;
};

type OAITool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

// ─── Auth ────────────────────────────────────────────────────────────────────

function checkAuth(req: Request, res: Response): boolean {
  const proxyKey = process.env["PROXY_API_KEY"];
  const auth = req.headers["authorization"];
  if (!proxyKey || auth !== `Bearer ${proxyKey}`) {
    res.status(401).json({ error: { message: "Unauthorized", type: "auth_error", code: 401 } });
    return false;
  }
  return true;
}

// ─── Disable TCP Nagle for streaming (sends chunks immediately) ───────────────

function enableStreamingSocket(res: Response): void {
  const socket = res.socket;
  if (socket) {
    socket.setNoDelay(true);
    socket.setTimeout(0);
  }
}

// ─── Content helpers ─────────────────────────────────────────────────────────

function extractText(content: string | OAIContentBlock[] | null | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function oaiImageToAnthropic(
  block: { type: "image_url"; image_url: { url: string } },
): Anthropic.ImageBlockParam {
  const url = block.image_url.url;
  const dataUriMatch = url.match(/^data:([^;]+);base64,(.+)$/s);
  if (dataUriMatch) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: dataUriMatch[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: dataUriMatch[2],
      },
    };
  }
  return { type: "image", source: { type: "url", url } };
}

function oaiContentToAnthropic(
  content: string | OAIContentBlock[] | null | undefined,
): Anthropic.ContentBlockParam[] {
  if (!content) return [{ type: "text", text: "" }];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content.map((block) => {
    if (block.type === "text") return { type: "text", text: block.text } as Anthropic.TextBlockParam;
    if (block.type === "image_url") return oaiImageToAnthropic(block);
    return { type: "text", text: "" } as Anthropic.TextBlockParam;
  });
}

// ─── Tool conversion ─────────────────────────────────────────────────────────

function oaiToolsToAnthropic(tools: OAITool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool["input_schema"],
  }));
}

function buildAnthropicMessages(messages: OAIMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
      const toolResultContent = typeof m.content === "string" ? m.content : extractText(m.content);
      const block: Anthropic.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: toolResultContent,
      };
      const last = result[result.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.ContentBlockParam[]).push(block);
      } else {
        result.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) {
        const text = extractText(m.content);
        if (text) blocks.push({ type: "text", text });
      }
      for (const tc of m.tool_calls) {
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input,
        } as Anthropic.ToolUseBlockParam);
      }
      result.push({ role: "assistant", content: blocks });
      continue;
    }

    if (m.role === "user" || m.role === "assistant") {
      result.push({
        role: m.role as "user" | "assistant",
        content: oaiContentToAnthropic(m.content),
      });
    }
  }

  return result;
}

function anthropicStopToOAI(stopReason: string | null | undefined): string {
  if (stopReason === "tool_use") return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  return "stop";
}

function anthropicContentToOAI(content: Anthropic.ContentBlock[]): {
  text: string | null;
  tool_calls: OAIToolCall[] | undefined;
} {
  const textParts: string[] = [];
  const tool_calls: OAIToolCall[] = [];

  for (const block of content) {
    if (block.type === "text") textParts.push(block.text);
    if (block.type === "tool_use") {
      tool_calls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join("\n") : null,
    tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
  };
}

// ─── Write SSE chunk ──────────────────────────────────────────────────────────

function writeChunk(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/models", (_req, res) => {
  res.json({ object: "list", data: MODELS });
});

router.post("/chat/completions", async (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;

  const body = req.body as {
    model?: string;
    messages?: OAIMessage[];
    stream?: boolean;
    tools?: OAITool[];
    tool_choice?: unknown;
    [key: string]: unknown;
  };

  const model = body.model ?? "gpt-5.2";
  const messages: OAIMessage[] = body.messages ?? [];
  const isStream = body.stream === true;
  const isAnthropic = model.startsWith("claude");
  const tools = body.tools;
  const tool_choice = body.tool_choice;

  // ── Streaming ─────────────────────────────────────────────────────────────
  if (isStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    enableStreamingSocket(res); // Disable Nagle's algorithm for immediate chunk delivery

    const keepalive = setInterval(() => res.write(": keepalive\n\n"), 5000);
    req.on("close", () => clearInterval(keepalive));

    try {
      if (isAnthropic) {
        const systemText = messages
          .filter((m) => m.role === "system")
          .map((m) => extractText(m.content))
          .join("\n");

        const chatMessages = buildAnthropicMessages(messages);
        const anthropicTools = tools && tools.length > 0 ? oaiToolsToAnthropic(tools) : undefined;

        const chunkId = `chatcmpl-${Date.now()}`;
        const created = Math.floor(Date.now() / 1000);
        const toolUseBlocks: Record<number, { id: string; name: string; inputJson: string }> = {};
        let currentBlockIndex = -1;

        const stream = anthropic.messages.stream({
          model,
          max_tokens: 8192,
          ...(systemText ? { system: systemText } : {}),
          messages: chatMessages,
          ...(anthropicTools ? { tools: anthropicTools } : {}),
        });

        let sentRole = false;

        for await (const event of stream) {
          // Emit a role chunk the moment Anthropic acknowledges the request.
          // This drops TTFT (time-to-first-token) from "when model generates
          // its first word" to "when Anthropic accepts the connection",
          // which is usually < 2 s even for heavy reasoning tasks.
          if (!sentRole && (event.type === "message_start" || event.type === "content_block_start")) {
            sentRole = true;
            writeChunk(res, {
              id: chunkId, object: "chat.completion.chunk", created, model,
              choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
            });
          }

          if (event.type === "content_block_start") {
            currentBlockIndex = event.index;
            if (event.content_block.type === "tool_use") {
              toolUseBlocks[event.index] = { id: event.content_block.id, name: event.content_block.name, inputJson: "" };
              writeChunk(res, {
                id: chunkId, object: "chat.completion.chunk", created, model,
                choices: [{
                  index: 0,
                  delta: {
                    tool_calls: [{
                      index: Object.keys(toolUseBlocks).length - 1,
                      id: event.content_block.id,
                      type: "function",
                      function: { name: event.content_block.name, arguments: "" },
                    }],
                  },
                  finish_reason: null,
                }],
              });
            }
          }

          if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              writeChunk(res, {
                id: chunkId, object: "chat.completion.chunk", created, model,
                choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null }],
              });
            }
            if (event.delta.type === "input_json_delta") {
              const block = toolUseBlocks[currentBlockIndex];
              if (block) {
                block.inputJson += event.delta.partial_json;
                const toolIdx = Object.keys(toolUseBlocks).indexOf(String(currentBlockIndex));
                writeChunk(res, {
                  id: chunkId, object: "chat.completion.chunk", created, model,
                  choices: [{
                    index: 0,
                    delta: { tool_calls: [{ index: toolIdx, function: { arguments: event.delta.partial_json } }] },
                    finish_reason: null,
                  }],
                });
              }
            }
          }

          if (event.type === "message_delta" && event.delta.stop_reason) {
            writeChunk(res, {
              id: chunkId, object: "chat.completion.chunk", created, model,
              choices: [{ index: 0, delta: {}, finish_reason: anthropicStopToOAI(event.delta.stop_reason) }],
            });
          }
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } else {
        const openaiStream = await openai.chat.completions.create({
          model,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          stream: true,
          ...(tools && tools.length > 0 ? { tools: tools as Parameters<typeof openai.chat.completions.create>[0]["tools"] } : {}),
          ...(tool_choice !== undefined ? { tool_choice: tool_choice as Parameters<typeof openai.chat.completions.create>[0]["tool_choice"] } : {}),
        });

        for await (const chunk of openaiStream) {
          writeChunk(res, chunk);
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Stream error";
      writeChunk(res, { error: { message, type: "server_error" } });
      res.end();
    } finally {
      clearInterval(keepalive);
    }

  // ── Non-streaming: stream internally then return complete response ─────────
  } else {
    try {
      if (isAnthropic) {
        const systemText = messages
          .filter((m) => m.role === "system")
          .map((m) => extractText(m.content))
          .join("\n");

        const chatMessages = buildAnthropicMessages(messages);
        const anthropicTools = tools && tools.length > 0 ? oaiToolsToAnthropic(tools) : undefined;

        const response = await anthropic.messages.create({
          model,
          max_tokens: 8192,
          ...(systemText ? { system: systemText } : {}),
          messages: chatMessages,
          ...(anthropicTools ? { tools: anthropicTools } : {}),
        });

        const { text, tool_calls } = anthropicContentToOAI(response.content);

        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: text,
              ...(tool_calls ? { tool_calls } : {}),
            },
            finish_reason: anthropicStopToOAI(response.stop_reason),
          }],
          usage: {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        });
      } else {
        const response = await openai.chat.completions.create({
          model,
          messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          stream: false,
          ...(tools && tools.length > 0 ? { tools: tools as Parameters<typeof openai.chat.completions.create>[0]["tools"] } : {}),
          ...(tool_choice !== undefined ? { tool_choice: tool_choice as Parameters<typeof openai.chat.completions.create>[0]["tool_choice"] } : {}),
        });

        res.json(response);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Internal server error";
      res.status(500).json({ error: { message, type: "server_error", code: 500 } });
    }
  }
});

export default router;
