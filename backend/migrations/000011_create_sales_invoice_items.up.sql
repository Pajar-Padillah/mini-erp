CREATE TABLE sales_invoice_items (
    id                       BIGSERIAL PRIMARY KEY,
    sales_invoice_id         BIGINT NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    line_no                  INT NOT NULL,
    source_delivery_item_id  BIGINT NOT NULL REFERENCES sales_delivery_items(id) ON DELETE RESTRICT,
    product_id               BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    qty                      NUMERIC(18,3) NOT NULL CHECK (qty > 0),
    unit_price                NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_invoice_id, line_no)
);
CREATE INDEX idx_sii_invoice_id ON sales_invoice_items(sales_invoice_id);
CREATE INDEX idx_sii_source_delivery_item ON sales_invoice_items(source_delivery_item_id);
