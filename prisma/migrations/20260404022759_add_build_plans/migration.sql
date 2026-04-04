-- CreateTable
CREATE TABLE "BuildPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "BuildPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuildPlanItem_planId_typeId_key" ON "BuildPlanItem"("planId", "typeId");

-- AddForeignKey
ALTER TABLE "BuildPlan" ADD CONSTRAINT "BuildPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPlanItem" ADD CONSTRAINT "BuildPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BuildPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildPlanItem" ADD CONSTRAINT "BuildPlanItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
