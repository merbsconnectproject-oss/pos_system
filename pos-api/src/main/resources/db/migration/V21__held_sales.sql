create table held_sale (
    id uuid primary key default gen_random_uuid(),
    outlet_id uuid not null references outlet(id),
    terminal_id uuid references terminal(id),
    cashier_id uuid not null references app_user(id),
    label varchar(160) not null,
    customer_id uuid references customer(id),
    customer_name varchar(200),
    customer_phone varchar(40),
    total bigint not null,
    cart_json jsonb not null,
    held_at timestamptz not null default now(),
    constraint held_sale_total_non_negative check (total >= 0)
);

create index held_sale_outlet_held_at_idx on held_sale(outlet_id, held_at desc);
