-- V9 · A till for every outlet — BR-6
--
-- A sale cannot be numbered without a terminal, and a terminal cannot number
-- anything without a block. InitialAdminBootstrap creates one, but only on an
-- empty installation — an outlet that already existed before V8 has none, and
-- the first attempt to sell fails with NO_TERMINAL.
--
-- Blocks are allocated above everything already handed out at that outlet, so
-- running this can never overlap a range some till is already issuing from.

INSERT INTO terminal (outlet_id, code, name, seq_block_start, seq_block_end, seq_current)
SELECT o.id,
       '01',
       'Counter 1',
       next_start.value,
       next_start.value + 9999,
       next_start.value
  FROM outlet o
 CROSS JOIN LATERAL (
       SELECT COALESCE(MAX(t.seq_block_end), 0) + 1 AS value
         FROM terminal t
        WHERE t.outlet_id = o.id
 ) AS next_start
 WHERE NOT EXISTS (
       SELECT 1 FROM terminal t WHERE t.outlet_id = o.id
 );
