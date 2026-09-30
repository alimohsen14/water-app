-- CreateTable
CREATE TABLE "Meter" (
    "id" TEXT NOT NULL,
    "devEUI" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentReading" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "batteryPercentage" INTEGER,
    "valveStatus" TEXT,
    "lastReadingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "reading" DECIMAL(65,30) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "batteryPercentage" INTEGER,
    "valveStatus" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyConsumption" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "consumption" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rawValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meter_devEUI_key" ON "Meter"("devEUI");

-- CreateIndex
CREATE UNIQUE INDEX "Meter_meterId_key" ON "Meter"("meterId");

-- CreateIndex
CREATE INDEX "Reading_meterId_idx" ON "Reading"("meterId");

-- CreateIndex
CREATE INDEX "DailyConsumption_meterId_idx" ON "DailyConsumption"("meterId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyConsumption_meterId_date_key" ON "DailyConsumption"("meterId", "date");

-- CreateIndex
CREATE INDEX "Alert_meterId_idx" ON "Alert"("meterId");

-- AddForeignKey
ALTER TABLE "Reading" ADD CONSTRAINT "Reading_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyConsumption" ADD CONSTRAINT "DailyConsumption_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
