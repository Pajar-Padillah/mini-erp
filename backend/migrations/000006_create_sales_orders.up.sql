CREATE TABLE sales_orders (
    id               BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    order_no         VARCHAR(40) NOT NULL UNIQUE,
    customer_name    VARCHAR(200) NOT NULL,
    order_date       DATE NOT NULL,
    document_status  VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (document_status IN ('DRAFT','ACTIVE','PROCESSED','COMPLETED')),
    total_amount     NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes            TEXT,
    created_by       VARCHAR(150),
    submitted_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);
CREATE INDEX idx_so_company_status ON sales_orders(company_id, document_status);
CREATE INDEX idx_so_company_created ON sales_orders(company_id, created_at DESC);
CREATE INDEX idx_so_deleted_at ON sales_orders(deleted_at);
