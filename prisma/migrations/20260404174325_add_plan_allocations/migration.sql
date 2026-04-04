-- CreateTable
CREATE TABLE "BuildPlanAllocation" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BuildPlanAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildPlanAllocation_planId_typeId_key" ON "BuildPlanAllocation"("planId", "typeId");

-- AddForeignKey
ALTER TABLE "BuildPlanAllocation" ADD CONSTRAINT "BuildPlanAllocation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BuildPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPlanAllocation" ADD CONSTRAINT "BuildPlanAllocation_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
