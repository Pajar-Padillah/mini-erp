CREATE TABLE sales_payment_allocations (
    id                BIGSERIAL PRIMARY KEY,
    sales_payment_id  BIGINT NOT NULL REFERENCES sales_payments(id) ON DELETE RESTRICT,
    sales_invoice_id  BIGINT NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
    line_no           INT NOT NULL,
    amount            NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (sales_payment_id, line_no)
);
CREATE INDEX idx_spa_payment_id ON sales_payment_allocations(sales_payment_id);
CREATE INDEX idx_spa_invoice_id ON sales_payment_allocations(sales_invoice_id);
