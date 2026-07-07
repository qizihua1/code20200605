import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";
import { z } from "zod";

const querySchema = z.object({
  externalCode: z.string().min(1, "externalCode is required"),
});

export const GET = withRequestLogging(
  withExternalApiAuth(async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      externalCode: searchParams.get("externalCode") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid parameters",
          code: "INVALID_PARAMS",
          details: parsed.error.flatten(),
          exists: false,
          data: null,
          source: "v2-realtime",
          fetchedAt: new Date(),
        },
        { status: 400 }
      );
    }
    const { externalCode } = parsed.data;
    
    try {
      const shipment = await prisma.shipment.findFirst({
        where: { externalCode },
        include: { items: true },
      });
      return NextResponse.json(
        {
          data: shipment,
          exists: !!shipment,
          source: "v2-realtime",
          fetchedAt: new Date(),
        },
        { status: 200 }
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "Database error",
          code: "DB_ERROR",
          message: err?.message,
          exists: false,
          data: null,
          source: "v2-realtime",
          fetchedAt: new Date(),
        },
        { status: 500 }
      );
    }
  })
);
