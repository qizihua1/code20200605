-- CreateTable
CREATE TABLE "parsing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "fieldMappings" JSONB NOT NULL,
    "aggregations" JSONB,
    "transformations" JSONB,
    "extractions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "parsing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "externalCode" TEXT,
    "storeName" TEXT,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "recipientAddress" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "parsingRuleId" TEXT,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "skuName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "specification" TEXT,
    "remarks" TEXT,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipments_externalCode_idx" ON "shipments"("externalCode");

-- CreateIndex
CREATE INDEX "shipments_recipientName_idx" ON "shipments"("recipientName");

-- CreateIndex
CREATE INDEX "shipments_submittedAt_idx" ON "shipments"("submittedAt");

-- CreateIndex
CREATE INDEX "shipment_items_shipmentId_idx" ON "shipment_items"("shipmentId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_parsingRuleId_fkey" FOREIGN KEY ("parsingRuleId") REFERENCES "parsing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
