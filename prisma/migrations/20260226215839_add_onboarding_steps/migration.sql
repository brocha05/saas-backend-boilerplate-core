-- CreateTable
CREATE TABLE "onboarding_steps" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_steps_company_id_idx" ON "onboarding_steps"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_steps_company_id_step_key" ON "onboarding_steps"("company_id", "step");

-- AddForeignKey
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
