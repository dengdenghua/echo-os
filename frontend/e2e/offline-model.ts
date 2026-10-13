import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A deterministic OpenAI-compatible endpoint on 127.0.0.1 for the full-stack
 * lane. It answers chat completions with a fixed reply so the model setup in
 * 系统设置 › 模型与用量 can be tested end to end without a provider key or a
 * network connection. Every request is recorded for assertions.
 */
export type OfflineModelRequest = {
  method: string;
  path: string;
  authorization: string;
  model: string;
};

export type OfflineModel = {
  baseUrl: string;
  requests: OfflineModelRequest[];
  close: () => Promise<void>;
};

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return body;
}

export async function startOfflineModel(
  modelId: string,
): Promise<OfflineModel> {
  const requests: OfflineModelRequest[] = [];
  const server = createServer(async (request, response) => {
    const body = await readBody(request);
    let payload: { model?: string; stream?: boolean } = {};
    try {
      payload = body ? (JSON.parse(body) as typeof payload) : {};
    } catch {
      payload = {};
    }
    const path = new URL(request.url || "/", "http://offline.invalid").pathname;
    requests.push({
      method: request.method || "",
      path,
      authorization: String(request.headers.authorization || ""),
      model: String(payload.model || ""),
    });

    if (path.endsWith("/models")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data: [{ id: modelId, object: "model" }],
        }),
      );
      return;
    }
    if (!path.endsWith("/chat/completions")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }
    const usage = { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 };
    if (payload.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta: object, finish: string | null, extra = {}) =>
        `data: ${JSON.stringify({
          id: "offline-1",
          object: "chat.completion.chunk",
          created: 1,
          model: modelId,
          choices: [{ index: 0, delta, finish_reason: finish }],
          ...extra,
        })}\n\n`;
      response.write(chunk({ role: "assistant", content: "ok" }, null));
      response.write(chunk({}, "stop", { usage }));
      response.end("data: [DONE]\n\n");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        id: "offline-1",
        object: "chat.completion",
        created: 1,
        model: modelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
        usage,
      }),
    );
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
