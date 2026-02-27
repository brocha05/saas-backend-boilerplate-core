-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "limits" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "usage_meters" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usage_meters_company_id_period_idx" ON "usage_meters"("company_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "usage_meters_company_id_metric_period_key" ON "usage_meters"("company_id", "metric", "period");

-- AddForeignKey
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
