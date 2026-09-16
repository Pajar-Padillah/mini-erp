CREATE TABLE sales_deliveries (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    sales_order_id    BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
    delivery_no       VARCHAR(40) NOT NULL UNIQUE,
    delivery_date     DATE NOT NULL,
    document_status   VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (document_status IN ('DRAFT','ACTIVE','PROCESSED','COMPLETED')),
    notes             TEXT,
    submitted_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_sd_company_status ON sales_deliveries(company_id, document_status);
CREATE INDEX idx_sd_order_id ON sales_deliveries(sales_order_id);
CREATE INDEX idx_sd_deleted_at ON sales_deliveries(deleted_at);
