CREATE TABLE sales_delivery_items (
    id                    BIGSERIAL PRIMARY KEY,
    sales_delivery_id     BIGINT NOT NULL REFERENCES sales_deliveries(id) ON DELETE RESTRICT,
    line_no               INT NOT NULL,
    source_order_item_id  BIGINT NOT NULL REFERENCES sales_order_items(id) ON DELETE RESTRICT,
    product_id            BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty                   NUMERIC(18,3) NOT NULL CHECK (qty > 0),
    unit_price            NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_delivery_id, line_no)
);
CREATE INDEX idx_sdi_delivery_id ON sales_delivery_items(sales_delivery_id);
CREATE INDEX idx_sdi_source_order_item ON sales_delivery_items(source_order_item_id);
