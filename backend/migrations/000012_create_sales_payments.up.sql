CREATE TABLE sales_payments (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    payment_no        VARCHAR(40) NOT NULL UNIQUE,
    payment_date      DATE NOT NULL,
    payment_method    VARCHAR(30),
    document_status   VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (document_status IN ('DRAFT','SUBMITTED')),
    total_amount      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    notes             TEXT,
    submitted_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_sp_company_status ON sales_payments(company_id, document_status);
CREATE INDEX idx_sp_deleted_at ON sales_payments(deleted_at);
