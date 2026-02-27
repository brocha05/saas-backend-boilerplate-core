-- CreateIndex
CREATE INDEX "companies_deleted_at_id_idx" ON "companies"("deleted_at", "id");

-- CreateIndex
CREATE INDEX "email_logs_company_id_status_idx" ON "email_logs"("company_id", "status");

-- CreateIndex
CREATE INDEX "files_company_id_deleted_at_idx" ON "files"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "files_company_id_resource_type_resource_id_idx" ON "files"("company_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_company_id_read_at_idx" ON "notifications"("user_id", "company_id", "read_at");

-- CreateIndex
CREATE INDEX "subscriptions_company_id_status_idx" ON "subscriptions"("company_id", "status");

-- CreateIndex
CREATE INDEX "users_company_id_deleted_at_idx" ON "users"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "users_company_id_role_idx" ON "users"("company_id", "role");
