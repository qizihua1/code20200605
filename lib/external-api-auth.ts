import { NextResponse } from "next/server";
import crypto from "crypto";

type ApiHandler = (
  req: Request,
  ctx: { params: Record<string, string | string[]> }
) => Promise<NextResponse>;

export function withExternalApiAuth(handler: ApiHandler): ApiHandler {
  return async (req, ctx) => {
    const requestId = crypto.randomUUID();

    const apiKey = req.headers.get("x-api-key");
    const expectedKey = process.env.V3_EXTERNAL_API_KEY;

    if (!apiKey) {
      const res = NextResponse.json(
        {
          error: "Unauthorized",
          code: "API_KEY_MISSING",
          requestId,
        },
        { status: 401 }
      );
      res.headers.set("x-request-id", requestId);
      return res;
    }

    if (!expectedKey) {
      const res = NextResponse.json(
        {
          error: "Unauthorized",
          code: "API_KEY_INVALID",
          requestId,
        },
        { status: 401 }
      );
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const keyBytes = Buffer.from(apiKey);
    const expectedBytes = Buffer.from(expectedKey);

    let isValid = false;
    try {
      isValid =
        keyBytes.length === expectedBytes.length &&
        crypto.timingSafeEqual(keyBytes, expectedBytes);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      const res = NextResponse.json(
        {
          error: "Unauthorized",
          code: "API_KEY_INVALID",
          requestId,
        },
        { status: 401 }
      );
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const response = await handler(req, ctx);
    response.headers.set("x-request-id", requestId);

    const body = await response.json().catch(() => null);
    if (body && typeof body === "object" && !("requestId" in body)) {
      const newBody = { ...body, requestId };
      const newRes = NextResponse.json(newBody, {
        status: response.status,
        headers: response.headers,
      });
      return newRes;
    }

    return response;
  };
}

export { generateRequestId };

function generateRequestId(): string {
  return crypto.randomUUID();
}
