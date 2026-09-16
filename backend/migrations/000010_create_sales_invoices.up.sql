CREATE TABLE sales_invoices (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    invoice_no        VARCHAR(40) NOT NULL UNIQUE,
    invoice_date      DATE NOT NULL,
    document_status   VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (document_status IN ('DRAFT','ACTIVE','PROCESSED','COMPLETED')),
    payment_status    VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
                      CHECK (payment_status IN ('UNPAID','PARTIALLY_PAID','PAID')),
    total_amount      NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    notes             TEXT,
    submitted_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    CHECK (paid_amount <= total_amount)
);
CREATE INDEX idx_si_company_status ON sales_invoices(company_id, document_status);
CREATE INDEX idx_si_payment_status ON sales_invoices(payment_status);
CREATE INDEX idx_si_deleted_at ON sales_invoices(deleted_at);
