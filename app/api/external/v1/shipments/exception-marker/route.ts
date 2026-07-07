import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";
import { z } from "zod";

// 兼容 V3 客户端：severity / exceptionType 接受任意字符串大小写
const bodySchema = z.object({
  idOrExternalCode: z.string().min(1, "idOrExternalCode is required"),
  hasException: z.boolean(),
  exceptionType: z.string().optional(),
  ticketId: z.string().optional(),
  severity: z.string().optional(),
  remark: z.string().optional(),
});

export const PATCH = withRequestLogging(
  withExternalApiAuth(async (req) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_JSON", ok: false },
        { status: 400 }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid body parameters",
          code: "INVALID_BODY",
          details: parsed.error.flatten(),
          ok: false,
        },
        { status: 422 }
      );
    }
    const { idOrExternalCode, hasException, exceptionType, ticketId, severity, remark } =
      parsed.data;

    
    try {
      // 先按 id 查，找不到再按 externalCode 查询
      let existing = await prisma.shipment.findUnique({
        where: { id: idOrExternalCode },
      });
      if (!existing) {
        existing = await prisma.shipment.findFirst({
          where: { externalCode: idOrExternalCode },
        });
      }
      if (!existing) {
        return NextResponse.json(
          {
            error: "Shipment not found",
            code: "SHIPMENT_NOT_FOUND",
            exists: false,
            ok: false,
          },
          { status: 422 }
        );
      }
      const previousStatus: any = existing.status;
      const typeNorm = (exceptionType ?? "unknown").toLowerCase().replace(/[^a-z0-9]/g, "");
      const currentStatus: string = hasException
        ? `exception_${typeNorm || "unknown"}`
        : (existing as any).submittedAt
          ? "submitted"
          : "pending";

      await prisma.shipment.update({
        where: { id: existing.id },
        data: { status: currentStatus },
      });

      return NextResponse.json(
        {
          ok: true,
          previousStatus,
          currentStatus,
          ticketId: ticketId ?? null,
          severity: severity ?? null,
          remark: remark ?? null,
        },
        { status: 200 }
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "Database error",
          code: "DB_ERROR",
          message: err?.message,
          ok: false,
        },
        { status: 500 }
      );
    }
  })
);
