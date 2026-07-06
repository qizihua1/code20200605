import { NextResponse } from "next/server";
import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";
import { z } from "zod";

const bodySchema = z.object({
  hasException: z.boolean(),
  exceptionType: z.enum(["qc", "logistics"]).optional(),
  ticketId: z.string().optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  remark: z.string().optional(),
});

type Params = { params: { id: string } };

export const PATCH = withRequestLogging(
  withExternalApiAuth(async (req: Request, { params }: Params) => {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
          code: "INVALID_JSON",
        },
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
        },
        { status: 422 }
      );
    }

    const { hasException, exceptionType, ticketId, severity, remark } =
      parsed.data;

    const { searchParams } = new URL(req.url);
    const byExternalCode = searchParams.get("byExternalCode");

    const { PrismaClient } = await import("@/lib/prisma");
    const prisma = new PrismaClient();

    try {
      let whereClause: Record<string, any>;
      if (byExternalCode) {
        whereClause = { externalCode: byExternalCode };
      } else {
        whereClause = { id: params.id };
      }

      const existing = await prisma.shipment.findUnique({
        where: whereClause,
      });

      if (!existing) {
        return NextResponse.json(
          {
            error: "Shipment not found",
            code: "SHIPMENT_NOT_FOUND",
            exists: false,
          },
          { status: 422 }
        );
      }

      const previousStatus = existing.status;
      let currentStatus: string;

      if (hasException) {
        const type = exceptionType ?? "unknown";
        currentStatus = `exception_${type}`;
      } else {
        currentStatus = existing.submittedAt ? "submitted" : "pending";
      }

      const updated = await prisma.shipment.update({
        where: whereClause,
        data: {
          status: currentStatus,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          previousStatus,
          currentStatus: updated.status,
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
    } finally {
      await prisma.$disconnect();
    }
  })
);
