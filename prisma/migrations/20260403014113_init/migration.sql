-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('MANUFACTURING', 'RESEARCH_TIME', 'RESEARCH_MATERIAL', 'COPYING', 'INVENTION', 'REACTION');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('ACTIVE', 'PAUSED', 'READY', 'DELIVERED', 'CANCELLED', 'REVERTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "characterId" INTEGER NOT NULL,
    "characterName" TEXT NOT NULL,
    "corporationId" INTEGER,
    "allianceId" INTEGER,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterToken" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupId" INTEGER NOT NULL,
    "volume" DOUBLE PRECISION,
    "mass" DOUBLE PRECISION,
    "published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SdeType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeGroup" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "SdeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeCategory" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SdeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blueprint" (
    "typeId" INTEGER NOT NULL,
    "maxProductionLimit" INTEGER NOT NULL,

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("typeId")
);

-- CreateTable
CREATE TABLE "BlueprintActivity" (
    "id" SERIAL NOT NULL,
    "blueprintId" INTEGER NOT NULL,
    "activity" "ActivityType" NOT NULL,
    "time" INTEGER NOT NULL,

    CONSTRAINT "BlueprintActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintMaterial" (
    "id" SERIAL NOT NULL,
    "blueprintActivityId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "BlueprintMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintProduct" (
    "id" SERIAL NOT NULL,
    "blueprintActivityId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION,

    CONSTRAINT "BlueprintProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlueprintSkill" (
    "id" SERIAL NOT NULL,
    "blueprintActivityId" INTEGER NOT NULL,
    "skillTypeId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "BlueprintSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeRegion" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SdeRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeSolarSystem" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" INTEGER NOT NULL,
    "security" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SdeSolarSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SdeStation" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "solarSystemId" INTEGER NOT NULL,

    CONSTRAINT "SdeStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryJob" (
    "jobId" INTEGER NOT NULL,
    "characterId" TEXT NOT NULL,
    "activityId" INTEGER NOT NULL,
    "blueprintTypeId" INTEGER NOT NULL,
    "outputTypeId" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "completedDate" TIMESTAMP(3),
    "facilityId" BIGINT NOT NULL,
    "cost" DOUBLE PRECISION,
    "probability" DOUBLE PRECISION,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndustryJob_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "OwnedBlueprint" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemId" BIGINT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "locationId" BIGINT NOT NULL,
    "runs" INTEGER NOT NULL,
    "materialEfficiency" INTEGER NOT NULL,
    "timeEfficiency" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnedBlueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "itemId" BIGINT NOT NULL,
    "characterId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "locationId" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isSingleton" BOOLEAN NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "orderId" BIGINT NOT NULL,
    "characterId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "locationId" BIGINT NOT NULL,
    "volumeTotal" INTEGER NOT NULL,
    "volumeRemain" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isBuyOrder" BOOLEAN NOT NULL,
    "issued" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Character_characterId_key" ON "Character"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterToken_characterId_key" ON "CharacterToken"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintActivity_blueprintId_activity_key" ON "BlueprintActivity"("blueprintId", "activity");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintMaterial_blueprintActivityId_typeId_key" ON "BlueprintMaterial"("blueprintActivityId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintProduct_blueprintActivityId_typeId_key" ON "BlueprintProduct"("blueprintActivityId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintSkill_blueprintActivityId_skillTypeId_key" ON "BlueprintSkill"("blueprintActivityId", "skillTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnedBlueprint_characterId_itemId_key" ON "OwnedBlueprint"("characterId", "itemId");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterToken" ADD CONSTRAINT "CharacterToken_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdeType" ADD CONSTRAINT "SdeType_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SdeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdeGroup" ADD CONSTRAINT "SdeGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SdeCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintActivity" ADD CONSTRAINT "BlueprintActivity_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "Blueprint"("typeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintMaterial" ADD CONSTRAINT "BlueprintMaterial_blueprintActivityId_fkey" FOREIGN KEY ("blueprintActivityId") REFERENCES "BlueprintActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintMaterial" ADD CONSTRAINT "BlueprintMaterial_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintProduct" ADD CONSTRAINT "BlueprintProduct_blueprintActivityId_fkey" FOREIGN KEY ("blueprintActivityId") REFERENCES "BlueprintActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintProduct" ADD CONSTRAINT "BlueprintProduct_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlueprintSkill" ADD CONSTRAINT "BlueprintSkill_blueprintActivityId_fkey" FOREIGN KEY ("blueprintActivityId") REFERENCES "BlueprintActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdeSolarSystem" ADD CONSTRAINT "SdeSolarSystem_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "SdeRegion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SdeStation" ADD CONSTRAINT "SdeStation_solarSystemId_fkey" FOREIGN KEY ("solarSystemId") REFERENCES "SdeSolarSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndustryJob" ADD CONSTRAINT "IndustryJob_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedBlueprint" ADD CONSTRAINT "OwnedBlueprint_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnedBlueprint" ADD CONSTRAINT "OwnedBlueprint_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "SdeType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
