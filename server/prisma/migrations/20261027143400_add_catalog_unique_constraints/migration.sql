-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_shop_id_name_unit_size_key" ON "products"("shop_id", "name", "unit_size");

-- CreateIndex
CREATE UNIQUE INDEX "shops_name_key" ON "shops"("name");
