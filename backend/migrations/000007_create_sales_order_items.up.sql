CREATE TABLE sales_order_items (
    id               BIGSERIAL PRIMARY KEY,
    sales_order_id   BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
    line_no          INT NOT NULL,
    product_id       BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty_ordered      NUMERIC(18,3) NOT NULL CHECK (qty_ordered > 0),
    unit_price       NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_order_id, line_no)
);
CREATE INDEX idx_soi_order_id ON sales_order_items(sales_order_id);
CREATE INDEX idx_soi_product_id ON sales_order_items(product_id);
