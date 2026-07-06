import { NextResponse } from "next/server";
import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  keyword: z.string().optional(),
  externalCode: z.string().optional(),
});

export const GET = withRequestLogging(
  withExternalApiAuth(async (req) => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("REQUEST_TIMEOUT"));
      }, 10000);
    });

    try {
      return await Promise.race([handleRequest(req), timeoutPromise]);
    } catch (err) {
      if (err instanceof Error && err.message === "REQUEST_TIMEOUT") {
        return NextResponse.json(
          {
            error: "Request Timeout",
            code: "TIMEOUT",
            requestId: (req as any).requestId,
          },
          { status: 504 }
        );
      }
      throw err;
    }
  })
);

async function handleRequest(req: Request) {
  const { searchParams } = new URL(req.url);

  const parsed = querySchema.safeParse({
    page: searchParams.get("page"),
    pageSize: searchParams.get("pageSize"),
    keyword: searchParams.get("keyword") ?? undefined,
    externalCode: searchParams.get("externalCode") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid parameters",
        code: "INVALID_PARAMS",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { page, pageSize, keyword, externalCode } = parsed.data;
  const skip = (page - 1) * pageSize;

  const { PrismaClient } = await import("@/lib/prisma");
  const prisma = new PrismaClient();

  try {
    const where: Record<string, any> = {};

    if (externalCode) {
      where.externalCode = externalCode;
    }

    if (keyword) {
      where.OR = [
        { externalCode: { contains: keyword } },
        { storeName: { contains: keyword } },
        { recipientName: { contains: keyword } },
        { recipientPhone: { contains: keyword } },
        { recipientAddress: { contains: keyword } },
      ];
    }

    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        include: { items: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.shipment.count({ where }),
    ]);

    return NextResponse.json(
      {
        data: shipments,
        total,
        page,
        pageSize,
        syncedAt: new Date(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Database error",
        code: "DB_ERROR",
        message: err?.message,
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
