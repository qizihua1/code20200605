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

    // ================================================================
    // Demo / Dev 友好：当 V2 侧未配置 V3_EXTERNAL_API_KEY 时，
    // 视为演示模式，跳过 API Key 检查直接放行。
    // 只有当 expectedKey 明确配置了，才做严格的鉴权比对。
    // ================================================================
    if (!expectedKey) {
      const response = await handler(req, ctx);
      response.headers.set("x-request-id", requestId);
      const body = await response.json().catch(() => null);
      if (body && typeof body === "object" && !("requestId" in body)) {
        const newBody = { ...body, requestId };
        return NextResponse.json(newBody, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    }

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
