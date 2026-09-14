-- Feature P · Settings — FR-SET-01, FR-SET-02, FR-SET-03, FR-SET-06
--
-- The thresholds in here are already law elsewhere in the system: BR-10 and
-- FR-INV-06 gate approvals on a value, FR-CASH-06 demands an explanation past
-- a variance, FR-POS-10 caps a discount by role. Until now those numbers were
-- constants in Java, which means a shop could not change them without a
-- release. This table is what turns them into settings.

-- One business, one row. The CHECK is what makes that true: an application
-- that believes there is a single settings row and a table that permits five
-- of them disagree exactly once, in production, on the day somebody inserts.
CREATE TABLE business_settings (
    id                           smallint     PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    -- FR-SET-01. Nullable because nobody has told us the legal name yet, and a
    -- seeded placeholder would print on receipts as though it were real.
    company_name                 varchar(200),
    trading_name                 varchar(200),
    tax_registration_number      varchar(60),
    phone                        varchar(40),
    email                        varchar(320),
    address                      varchar(240),
    logo_url                     varchar(500),

    tax_enabled                  boolean      NOT NULL DEFAULT false,
    tax_rate_percent             numeric(5,2) NOT NULL DEFAULT 0
        CHECK (tax_rate_percent >= 0 AND tax_rate_percent <= 100),

    currency_code                varchar(3)   NOT NULL DEFAULT 'GHS',
    currency_symbol              varchar(8)   NOT NULL DEFAULT 'GH₵',
    -- Cash rounding is the physical-coin problem: the smallest coin in
    -- circulation, not a display preference.
    cash_rounding                varchar(20)  NOT NULL DEFAULT 'EXACT'
        CHECK (cash_rounding IN ('EXACT', 'TEN_PESEWAS', 'FIFTY_PESEWAS')),

    -- FR-SET-05, the half that belongs to the business rather than the till.
    receipt_header_message       varchar(400),
    receipt_footer_policy        varchar(400),
    receipt_printer_width        varchar(8)   NOT NULL DEFAULT '80mm'
        CHECK (receipt_printer_width IN ('80mm', '58mm')),
    auto_print_receipt           boolean      NOT NULL DEFAULT true,
    show_cashier_on_receipt      boolean      NOT NULL DEFAULT true,

    -- FR-SET-03. Orange by default and never blue; the CHECK only guarantees
    -- it is a colour, since the palette is a product decision.
    accent_color                 varchar(7)   NOT NULL DEFAULT '#F97316'
        CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),

    -- FR-SET-06 · BR-11: pesewas, like every other amount in this schema.
    idle_lock_minutes            integer      NOT NULL DEFAULT 10
        CHECK (idle_lock_minutes BETWEEN 1 AND 480),
    adjustment_approval_pesewas  bigint       NOT NULL DEFAULT 50000
        CHECK (adjustment_approval_pesewas >= 0),
    cash_variance_pesewas        bigint       NOT NULL DEFAULT 2000
        CHECK (cash_variance_pesewas >= 0),

    -- The policy switches the security tab offers. Off means the rule is not
    -- enforced, so each one is a deliberate decision with an audit entry.
    enforce_floor_price_approval boolean      NOT NULL DEFAULT true,
    enforce_void_approval        boolean      NOT NULL DEFAULT true,
    enforce_blind_shift_count    boolean      NOT NULL DEFAULT true,

    updated_at                   timestamptz  NOT NULL DEFAULT now(),
    updated_by                   uuid         REFERENCES app_user (id)
);

INSERT INTO business_settings (id) VALUES (1);

-- FR-POS-10: the discount a role may apply without an approver. A child table
-- rather than four columns, because roles are a list that grows and a column
-- per role means a migration every time one is added.
CREATE TABLE role_discount_ceiling (
    role        varchar(40)  PRIMARY KEY,
    max_percent numeric(5,2) NOT NULL
        CHECK (max_percent >= 0 AND max_percent <= 100)
);

INSERT INTO role_discount_ceiling (role, max_percent) VALUES
    ('owner', 100),
    ('manager', 25),
    ('cashier', 10),
    ('storekeeper', 0);

-- FR-SET-02: the reorder level a product starts at in this branch. A branch
-- that turns over a pallet a week and one that sells two a month cannot share
-- a single number, which is why it lives on the outlet and not in settings.
ALTER TABLE outlet
    ADD COLUMN default_reorder_level numeric(14,3) NOT NULL DEFAULT 0
        CHECK (default_reorder_level >= 0);
