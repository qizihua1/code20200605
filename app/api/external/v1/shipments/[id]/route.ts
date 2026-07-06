import { NextResponse } from "next/server";
import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";

type Params = { params: { id: string } };

export const GET = withRequestLogging(
  withExternalApiAuth(async (req: Request, { params }: Params) => {
    const { searchParams } = new URL(req.url);
    const byExternalCode = searchParams.get("byExternalCode");

    const { PrismaClient } = await import("@/lib/prisma");
    const prisma = new PrismaClient();

    try {
      let shipment;

      if (byExternalCode) {
        shipment = await prisma.shipment.findUnique({
          where: { externalCode: byExternalCode },
          include: { items: true },
        });
      } else {
        shipment = await prisma.shipment.findUnique({
          where: { id: params.id },
          include: { items: true },
        });
      }

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
    } finally {
      await prisma.$disconnect();
    }
  })
);
