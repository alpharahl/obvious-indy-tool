-- CreateTable
CREATE TABLE "BuildPlanDecision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,

    CONSTRAINT "BuildPlanDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildPlanDecision_planId_typeId_key" ON "BuildPlanDecision"("planId", "typeId");

-- AddForeignKey
ALTER TABLE "BuildPlanDecision" ADD CONSTRAINT "BuildPlanDecision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BuildPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPlanDecision" ADD CONSTRAINT "BuildPlanDecision_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
