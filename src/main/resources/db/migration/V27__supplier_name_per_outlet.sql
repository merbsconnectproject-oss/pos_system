-- Supplier names are unique within a shop, not across the business.
--
-- V7 made upper(name) globally unique, which is right for one shop and wrong for
-- the owner's instance: it holds both outlets, and both shops buy from Melcom.
-- The second shop's row would be refused on ingest — and since the refusal is on
-- the *name* index rather than the id, `on conflict (id)` never catches it. The
-- supplier is dropped, and then every goods receipt and purchase order pointing
-- at it fails its foreign key too. The owner quietly sees one shop's purchasing.
--
-- Coalesced because outlet_id is nullable and means "serves every branch": two
-- rows with a null outlet and the same name are still the same supplier twice.
DROP INDEX IF EXISTS idx_supplier_name_ci;

CREATE UNIQUE INDEX idx_supplier_name_per_outlet ON supplier
    (upper(name), coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid));
