CREATE TABLE document_number_sequences (
    id                BIGSERIAL PRIMARY KEY,
    company_id        BIGINT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    doc_type          VARCHAR(10) NOT NULL CHECK (doc_type IN ('SO','DO','INV','PAY')),
    last_number       BIGINT NOT NULL DEFAULT 0,
    UNIQUE (company_id, doc_type)
);
