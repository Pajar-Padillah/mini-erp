CREATE TABLE stocks (
    id                 BIGSERIAL PRIMARY KEY,
    company_id         BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    product_id         BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity_on_hand   NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, product_id)
);
CREATE INDEX idx_stocks_company ON stocks(company_id);
