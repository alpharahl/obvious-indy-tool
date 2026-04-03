-- CreateTable
CREATE TABLE "Structure" (
    "id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "solarSystemId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "typeId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Structure_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Structure" ADD CONSTRAINT "Structure_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SdeSolarSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
