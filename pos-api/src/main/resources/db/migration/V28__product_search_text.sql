-- NFR-1: product search under 300 ms at 3,000 products.
--
-- The trigram indexes from V4 were never used. The search matches every term
-- against six fields, and it expresses that as a correlated NOT EXISTS over
-- `regexp_split_to_table` — which Postgres can only answer by evaluating the
-- whole predicate once per product row. Three thousand rows × four terms × six
-- ILIKEs is a sequential scan with extra steps, and it measured 307–442 ms
-- against a 300 ms budget: failing most builds, and slower still on a counter PC.
--
-- The fix is not to rewrite the matching rule. It is to give the planner one
-- predicate it can answer from an index first, so the expensive rule runs on a
-- handful of rows instead of all of them. `search_text` holds everything the
-- search looks at, and the first term must match it — which is implied by the
-- existing rule, so the extra predicate changes no result, only the plan.

ALTER TABLE product ADD COLUMN IF NOT EXISTS search_text TEXT;

-- Everything the WHERE clause examines, in one column. If a field is searchable
-- and missing here, the pre-filter would exclude rows the rule would have kept —
-- so this list and the query's list are the same list, deliberately.
CREATE OR REPLACE FUNCTION product_search_text(p product) RETURNS text AS $$
    SELECT lower(concat_ws(' ',
        p.name,
        p.sku,
        p.description,
        (SELECT b.name FROM brand b WHERE b.id = p.brand_id),
        (SELECT c.name FROM category c WHERE c.id = p.category_id),
        (SELECT string_agg(bc.code, ' ') FROM product_barcode bc WHERE bc.product_id = p.id)
    ));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION refresh_product_search_text() RETURNS trigger AS $$
BEGIN
    NEW.search_text := product_search_text(NEW);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_text_maintained
    BEFORE INSERT OR UPDATE ON product
    FOR EACH ROW EXECUTE FUNCTION refresh_product_search_text();

-- A barcode is searchable and lives in its own table, so adding one has to
-- refresh the product it belongs to. Without this, a product found by barcode
-- yesterday stops being found the moment the pre-filter starts being used.
CREATE OR REPLACE FUNCTION refresh_product_search_text_from_barcode() RETURNS trigger AS $$
BEGIN
    UPDATE product SET search_text = product_search_text(product)
     WHERE id = coalesce(NEW.product_id, OLD.product_id);
    RETURN coalesce(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_barcode_refreshes_search
    AFTER INSERT OR UPDATE OR DELETE ON product_barcode
    FOR EACH ROW EXECUTE FUNCTION refresh_product_search_text_from_barcode();

-- Renaming a brand or a category changes what its products match on.
CREATE OR REPLACE FUNCTION refresh_products_of_brand() RETURNS trigger AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE product SET search_text = product_search_text(product) WHERE brand_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_rename_refreshes_search
    AFTER UPDATE ON brand
    FOR EACH ROW EXECUTE FUNCTION refresh_products_of_brand();

CREATE OR REPLACE FUNCTION refresh_products_of_category() RETURNS trigger AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE product SET search_text = product_search_text(product) WHERE category_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER category_rename_refreshes_search
    AFTER UPDATE ON category
    FOR EACH ROW EXECUTE FUNCTION refresh_products_of_category();

-- Existing rows.
UPDATE product SET search_text = product_search_text(product);

-- GIN rather than GiST: read on every keystroke at the counter, written only when
-- somebody edits the catalogue.
--
-- Measured, so that this is not folklore: at 3,000 products Postgres scans even
-- with fresh statistics, and the search still drops from 307–442 ms to ~51 ms —
-- that gain is the cheap predicate running before the expensive one, not the
-- index. At 30,000 rows the planner switches to a Bitmap Index Scan on this index
-- for a selective term, and keeps scanning for a term that matches most of the
-- table. Both are right. The index is here for the catalogue the client grows
-- into, and costs a write only when a product changes.
CREATE INDEX IF NOT EXISTS idx_product_search_trgm
    ON product USING gin (search_text gin_trgm_ops);
