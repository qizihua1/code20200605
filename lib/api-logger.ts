import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";

type LogEntry = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  apiKeyPrefix?: string;
  errorMessage?: string;
  requestSha256?: string;
  timestamp: string;
};

type ApiHandler = (
  req: Request,
  ctx: { params: Record<string, string | string[]> }
) => Promise<NextResponse>;

export function logExternalApiCall(entry: Omit<LogEntry, "timestamp">): void {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  console.info(
    `[EXTERNAL_API] ${fullEntry.timestamp} | ${fullEntry.method} ${fullEntry.path} | status=${fullEntry.statusCode} | duration=${fullEntry.durationMs}ms | requestId=${fullEntry.requestId} | keyPrefix=${fullEntry.apiKeyPrefix ?? "N/A"}${fullEntry.errorMessage ? ` | error=${fullEntry.errorMessage}` : ""}${fullEntry.requestSha256 ? ` | sha256=${fullEntry.requestSha256}` : ""}`
  );

  if (process.env.DEBUG) {
    try {
      const logDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, "external-api.log");
      const line = JSON.stringify(fullEntry) + "\n";
      fs.appendFileSync(logPath, line, "utf-8");
    } catch {
    }
  }
}

export function withRequestLogging(handler: ApiHandler): ApiHandler {
  return async (req, ctx) => {
    const startTime = Date.now();
    const url = new URL(req.url);
    const method = req.method;
    const pathname = url.pathname;

    const apiKeyHeader = req.headers.get("x-api-key") ?? "";
    const apiKeyPrefix = apiKeyHeader ? apiKeyHeader.slice(0, 6) + "..." : undefined;

    let requestSha256: string | undefined;
    try {
      const cloned = req.clone();
      const bodyBuf = await cloned.arrayBuffer();
      if (bodyBuf.byteLength > 0) {
        const hash = crypto.createHash("sha256");
        hash.update(Buffer.from(bodyBuf));
        requestSha256 = hash.digest("hex");
      }
    } catch {
    }

    let requestId = "";
    let response: NextResponse;
    let statusCode: number;
    let errorMessage: string | undefined;

    try {
      response = await handler(req, ctx);
      statusCode = response.status;
      requestId = response.headers.get("x-request-id") ?? crypto.randomUUID();
    } catch (err: any) {
      statusCode = 500;
      errorMessage = err?.message ?? "Unknown error";
      requestId = crypto.randomUUID();
      response = NextResponse.json(
        {
          error: "Internal Server Error",
          code: "INTERNAL_ERROR",
          message: errorMessage,
          requestId,
        },
        { status: 500 }
      );
      response.headers.set("x-request-id", requestId);
    }

    const durationMs = Date.now() - startTime;

    try {
      logExternalApiCall({
        method,
        path: pathname,
        statusCode,
        durationMs,
        requestId,
        apiKeyPrefix,
        errorMessage,
        requestSha256,
      });
    } catch {
    }

    return response;
  };
}
