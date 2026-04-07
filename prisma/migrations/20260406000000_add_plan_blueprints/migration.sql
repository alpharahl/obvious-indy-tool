-- CreateTable
CREATE TABLE "BuildPlanBlueprint" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "ownedBlueprintId" TEXT NOT NULL,

    CONSTRAINT "BuildPlanBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildPlanBlueprint_planId_typeId_key" ON "BuildPlanBlueprint"("planId", "typeId");

-- AddForeignKey
ALTER TABLE "BuildPlanBlueprint" ADD CONSTRAINT "BuildPlanBlueprint_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BuildPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPlanBlueprint" ADD CONSTRAINT "BuildPlanBlueprint_ownedBlueprintId_fkey" FOREIGN KEY ("ownedBlueprintId") REFERENCES "OwnedBlueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
