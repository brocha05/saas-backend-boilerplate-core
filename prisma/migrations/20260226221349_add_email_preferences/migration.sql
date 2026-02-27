-- CreateTable
CREATE TABLE "email_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "marketing" BOOLEAN NOT NULL DEFAULT true,
    "product_updates" BOOLEAN NOT NULL DEFAULT true,
    "billing" BOOLEAN NOT NULL DEFAULT true,
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_preferences_user_id_key" ON "email_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_preferences_unsubscribe_token_key" ON "email_preferences"("unsubscribe_token");

-- AddForeignKey
ALTER TABLE "email_preferences" ADD CONSTRAINT "email_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
