-- FR-CUST-07 · FR-RCPT-02/06: each installment collection is a permanent
-- document, not just an amount folded into a schedule row. This is what makes
-- payment history, balance-after-payment and exact receipt reprints possible.

CREATE TABLE installment_payment (
    id                     uuid         PRIMARY KEY,
    plan_id                uuid         NOT NULL REFERENCES installment_plan (id) ON DELETE CASCADE,
    outlet_id              uuid         NOT NULL REFERENCES outlet (id),
    receipt_number         varchar(48)  NOT NULL UNIQUE,
    amount_pesewas         bigint       NOT NULL CHECK (amount_pesewas > 0),
    balance_after_pesewas  bigint       NOT NULL CHECK (balance_after_pesewas >= 0),
    received_on            date         NOT NULL,
    payment_method         varchar(20)  NOT NULL
        CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER')),
    reference              varchar(80),
    received_by            uuid         REFERENCES app_user (id),
    cashier_name           varchar(200) NOT NULL,
    created_at             timestamptz  NOT NULL DEFAULT now(),
    synced_at              timestamptz
);

CREATE INDEX idx_installment_payment_plan
    ON installment_payment (plan_id, created_at DESC);
CREATE INDEX idx_installment_payment_outlet
    ON installment_payment (outlet_id, created_at DESC);

-- Preserve payments already collected before this table existed. The old
-- model retained only one aggregate per schedule row, so that is the most
-- precise historical document that can truthfully be reconstructed.
INSERT INTO installment_payment (
    id, plan_id, outlet_id, receipt_number, amount_pesewas,
    balance_after_pesewas, received_on, payment_method, reference,
    received_by, cashier_name, created_at
)
SELECT gen_random_uuid(),
       legacy.plan_id,
       legacy.outlet_id,
       legacy.plan_number || '-P' || lpad(legacy.installment_number::text, 2, '0'),
       legacy.paid_pesewas,
       greatest(0, legacy.financed_pesewas - legacy.cumulative_paid),
       legacy.received_on,
       legacy.payment_method,
       legacy.reference,
       legacy.received_by,
       legacy.cashier_name,
       legacy.received_on::timestamptz
FROM (
    SELECT s.plan_id,
           p.outlet_id,
           p.plan_number,
           s.installment_number,
           s.paid_pesewas,
           p.total_pesewas - p.down_payment_pesewas AS financed_pesewas,
           sum(s.paid_pesewas) OVER (
               PARTITION BY s.plan_id ORDER BY s.installment_number
           ) AS cumulative_paid,
           coalesce(s.paid_on, p.start_date) AS received_on,
           coalesce(s.payment_method, 'CASH') AS payment_method,
           s.reference,
           p.created_by AS received_by,
           coalesce(u.full_name, '(legacy payment)') AS cashier_name
    FROM installment_schedule_item s
    JOIN installment_plan p ON p.id = s.plan_id
    LEFT JOIN app_user u ON u.id = p.created_by
    WHERE s.paid_pesewas > 0
) legacy;

CREATE SEQUENCE installment_payment_receipt_seq START WITH 1 INCREMENT BY 1;
