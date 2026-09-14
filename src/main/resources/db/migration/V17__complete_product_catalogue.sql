-- V17 · Complete the mandatory product catalogue — FR-PROD-01/02/06/09/10

-- The supplier table arrived after product. Complete the relationship now.
ALTER TABLE product
    ADD CONSTRAINT product_supplier_fk
    FOREIGN KEY (supplier_id) REFERENCES supplier (id);

-- Auto-generated SKUs must remain unique when imports or tills run together.
-- next_value is the last number allocated for a prefix.
CREATE TABLE sku_sequence (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    prefix     TEXT        NOT NULL UNIQUE,
    next_value BIGINT      NOT NULL,
    synced_at  TIMESTAMPTZ
);

-- Description and partial barcode searches are part of FR-PROD-06.
CREATE INDEX idx_product_description_trgm
    ON product USING gin (description gin_trgm_ops);
CREATE INDEX idx_product_barcode_code_trgm
    ON product_barcode USING gin (code gin_trgm_ops);
