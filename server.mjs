import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fallbackModelsForTier, modelForTier, routeForTier } from "./src/js/llmConfig.js";

const root = resolve(".");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

async function readDotEnv() {
  try {
    const text = await readFile(join(root, ".env"), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        })
    );
  } catch {
    return {};
  }
}

async function getGeminiApiKey() {
  const envFile = await readDotEnv();
  return process.env.GEMINI_API_KEY || envFile.GEMINI_API_KEY || "";
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function toGeminiResponseSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiResponseSchema);
  if (!schema || typeof schema !== "object") return schema;
  const next = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    next[key] = toGeminiResponseSchema(value);
  }
  return next;
}

async function handleGemini(request, response) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    sendJson(response, 500, { error: "GEMINI_API_KEY is not set in the server environment." });
    return;
  }

  const body = await readJsonBody(request);
  const tier = body.settings?.modelTier || "medium";
  const route = routeForTier(tier);
  const model = body.model || modelForTier(tier);
  const fallbackModels = Array.isArray(body.fallbackModels) ? body.fallbackModels : fallbackModelsForTier(tier);
  const prompt = body.prompt || "";
  const systemInstruction = body.systemInstruction || "";
  const responseJsonSchema = body.responseJsonSchema || {};
  const maxOutputTokens = Number(body.settings?.maxOutputTokens || body.generation?.maxOutputTokens || route.maxOutputTokens || 4096);
  const thinkingLevel = body.settings?.thinkingLevel || body.generation?.thinkingLevel || route.thinkingLevel || "low";
  const thinkingBudget = Number(body.settings?.thinkingBudget || body.generation?.thinkingBudget || route.thinkingBudget || 0);
  const temperature = Number(body.settings?.temperature || body.generation?.temperature || route.temperature || 0.85);
  const modelsToTry = [...new Set([model, ...fallbackModels].filter(Boolean))];

  const configForModel = (candidateModel) => ({
    temperature,
    maxOutputTokens,
    thinkingLevel: route.fallbackConfig?.[candidateModel]?.thinkingLevel ?? thinkingLevel,
    thinkingBudget: Number(route.fallbackConfig?.[candidateModel]?.thinkingBudget ?? thinkingBudget)
  });

  const buildThinkingConfig = (candidateModel, includeThinking) => {
    if (!includeThinking) return {};
    const candidateConfig = configForModel(candidateModel);
    if (candidateModel.startsWith("gemini-2.5")) {
      return Number.isFinite(candidateConfig.thinkingBudget) ? { thinkingConfig: { thinkingBudget: candidateConfig.thinkingBudget } } : {};
    }
    return candidateConfig.thinkingLevel ? { thinkingConfig: { thinkingLevel: candidateConfig.thinkingLevel } } : {};
  };

  const buildSchemaConfig = (candidateModel) => {
    if (candidateModel.startsWith("gemini-2.5")) {
      return { responseJsonSchema };
    }
    return { responseSchema: toGeminiResponseSchema(responseJsonSchema) };
  };

  const buildGeminiBody = (candidateModel, includeThinking) => {
    const candidateConfig = configForModel(candidateModel);
    return ({
      system_instruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        ...buildSchemaConfig(candidateModel),
        ...buildThinkingConfig(candidateModel, includeThinking),
        temperature: candidateConfig.temperature,
        maxOutputTokens: candidateConfig.maxOutputTokens
      }
    });
  };

  const attempts = [];
  for (const candidateModel of modelsToTry) {
    for (const includeThinking of [true, false]) {
      const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(buildGeminiBody(candidateModel, includeThinking))
      });
      const payload = await upstream.json();
      if (upstream.ok) {
        const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
        const usedConfig = configForModel(candidateModel);
        sendJson(response, 200, {
          provider: "gemini",
          mode: "generate-content",
          model: candidateModel,
          text,
          payload,
          attempts,
          usedConfig,
          fallbackUsed: candidateModel !== model,
          fallbackReason: candidateModel !== model ? attempts.map((attempt) => `${attempt.model}: ${attempt.status} ${attempt.message}`).join(" | ") : ""
        });
        return;
      }
      const message = payload?.error?.message || "Gemini request failed.";
      attempts.push({ model: candidateModel, status: upstream.status, message, thinking: includeThinking, config: configForModel(candidateModel) });
      const thinkingUnsupported = upstream.status === 400 && /thinking/i.test(message) && /not supported/i.test(message);
      if (!thinkingUnsupported) break;
    }
  }

  const last = attempts.at(-1);
  sendJson(response, last?.status || 503, {
    error: last?.message || "Gemini request failed across all configured models.",
    attempts
  });
}

async function handleStatic(request, response) {
  const url = new URL(request.url, `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const bytes = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-goog-api-key"
      });
      response.end();
      return;
    }
    if (request.method === "POST" && request.url === "/api/gemini") {
      await handleGemini(request, response);
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await handleStatic(request, response);
      return;
    }
    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, host, () => {
  console.log(`TyA local server listening at http://${host}:${port}/`);
});
