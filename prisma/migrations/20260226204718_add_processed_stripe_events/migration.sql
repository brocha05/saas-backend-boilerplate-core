-- CreateTable
CREATE TABLE "processed_stripe_events" (
    "id" UUID NOT NULL,
    "stripe_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_stripe_events_stripe_event_id_key" ON "processed_stripe_events"("stripe_event_id");

-- CreateIndex
CREATE INDEX "processed_stripe_events_processed_at_idx" ON "processed_stripe_events"("processed_at");
