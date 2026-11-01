CREATE INDEX "holds_by_created" ON "holds" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "holds_by_expiry" ON "holds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_sold_by_update" ON "orders" USING btree ("updated_at") WHERE "orders"."status" IN ('paid', 'fulfilled');