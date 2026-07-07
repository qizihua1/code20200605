import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { withExternalApiAuth } from "@/lib/external-api-auth";
import { withRequestLogging } from "@/lib/api-logger";

type Params = { params: { id: string; skuCode: string } };

export const GET = withRequestLogging(
  withExternalApiAuth(async (req: Request, { params }: Params) => {
    const { searchParams } = new URL(req.url);
    const byExternalCode = searchParams.get("byExternalCode");

    

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

      let matchedItem = null;
      let belongs = false;

      if (shipment && shipment.items) {
        matchedItem =
          shipment.items.find(
            (item: any) =>
              item.skuCode.toLowerCase() === params.skuCode.toLowerCase()
          ) || null;
        belongs = !!matchedItem;
      }

      return NextResponse.json(
        {
          belongs,
          shipment,
          item: matchedItem,
        },
        { status: 200 }
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "Database error",
          code: "DB_ERROR",
          message: err?.message,
          belongs: false,
          shipment: null,
          item: null,
        },
        { status: 500 }
      );
    }
  })
);
