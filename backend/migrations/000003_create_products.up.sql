CREATE TABLE products (
    id          BIGSERIAL PRIMARY KEY,
    brand_id    BIGINT NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
    sku         VARCHAR(40) NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL,
    uom         VARCHAR(20) NOT NULL DEFAULT 'PCS',
    unit_price  NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_products_brand_id ON products(brand_id);
CREATE INDEX idx_products_deleted_at ON products(deleted_at);
