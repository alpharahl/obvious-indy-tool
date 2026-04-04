-- CreateTable
CREATE TABLE "Stockpile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stockpile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockpileItem" (
    "id" TEXT NOT NULL,
    "stockpileId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StockpileItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockpileItem_stockpileId_typeId_key" ON "StockpileItem"("stockpileId", "typeId");

-- AddForeignKey
ALTER TABLE "Stockpile" ADD CONSTRAINT "Stockpile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockpileItem" ADD CONSTRAINT "StockpileItem_stockpileId_fkey" FOREIGN KEY ("stockpileId") REFERENCES "Stockpile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockpileItem" ADD CONSTRAINT "StockpileItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
