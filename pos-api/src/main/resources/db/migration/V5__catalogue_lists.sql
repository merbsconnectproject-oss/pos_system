-- V5 · Catalogue setup — FR-PROD-05, FR-UOM-01
--
-- Categories and brands already had tables, but only ever grew as a side effect
-- of naming one on a product. Managing them — add, rename, retire — is the
-- other half of FR-PROD-05, and renaming is the reason the table earns its
-- place: products point at a row, so "Lighting & Lamps" becoming "Lighting"
-- is one update rather than a sweep through every product that carried the
-- old string.

-- ------------------------------------------------------------- units · FR-UOM-01

-- The list of base units a product may be measured in. Distinct from
-- product_selling_unit, which is one product's own units and their conversion
-- factors; this is the vocabulary those are drawn from.
CREATE TABLE unit_of_measure (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL UNIQUE,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    synced_at  TIMESTAMPTZ
);

-- ------------------------------------------------------------- seed

-- The frontend hard-coded these in ProductsView.tsx. Seeding them keeps the
-- pickers showing exactly what they show today, so moving the screen onto the
-- API changes where the list comes from and not what is in it.
INSERT INTO unit_of_measure (name) VALUES
    ('m'), ('pcs'), ('length'), ('roll'), ('box'),
    ('kg'), ('bucket'), ('tin'), ('set'), ('pair')
ON CONFLICT (name) DO NOTHING;

INSERT INTO category (name) VALUES
    ('Power Tools & Machinery'),
    ('Hand Tools & Hardware'),
    ('Plumbing & Sanitary'),
    ('Paints & Adhesives'),
    ('Fasteners & Fixings'),
    ('Building & Site Safety'),
    ('Cables & Wires'),
    ('Switches & Sockets'),
    ('Protection & Breakers'),
    ('Conduits & Trunking'),
    ('Lighting & Lamps'),
    ('Solar & Inverters'),
    ('Hardware & Tools'),
    ('Plumbing & Pipes')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------- lookups

-- Every list is read by name and filtered by active, on screens a cashier
-- opens constantly.
CREATE INDEX idx_category_active_name ON category (is_active, name);
CREATE INDEX idx_brand_active_name    ON brand (is_active, name);
CREATE INDEX idx_unit_active_name     ON unit_of_measure (is_active, name);

-- Case-insensitive uniqueness: "Nexans" and "nexans" are one brand, and two
-- rows differing only in case would split a catalogue in two.
CREATE UNIQUE INDEX idx_category_name_ci ON category (upper(name));
CREATE UNIQUE INDEX idx_brand_name_ci    ON brand (upper(name));
CREATE UNIQUE INDEX idx_unit_name_ci     ON unit_of_measure (upper(name));
