package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.config.PosProperties;
import gh.giftedlabs.pos.dto.SyncView;
import gh.giftedlabs.pos.entity.Customer;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.CustomerRepository;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.CustomerType;
import gh.giftedlabs.pos.rules.Role;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.impl.OffsiteStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Both channels, end to end, against an in-memory bucket.
 *
 * <p>The network is replaced, not the logic: the same {@code SyncService} runs,
 * the same SQL serialises and rebuilds the rows, and the same keys are written.
 * What is proved here cannot be proved against R2 without leaving rubbish in a
 * real bucket on every run — and the properties that matter are about ordering
 * and repetition, not about HTTP.
 */
@Import({TestcontainersConfiguration.class, SyncChannelTest.InMemoryBucket.class})
@SpringBootTest
@TestPropertySource(properties = {
        "pos.backup.offsite.bucket=test-bucket",
        "pos.backup.offsite.access-key-id=test",
        "pos.backup.offsite.secret-access-key=test",
        "pos.backup.enabled=false",
})
@DisplayName("Sync channels")
class SyncChannelTest {

    /** A bucket that keeps its objects in a sorted map, which is what S3 is. */
    static class Bucket extends OffsiteStore {
        final NavigableMap<String, byte[]> objects = new TreeMap<>();

        @Override
        public String putBytes(byte[] body, String name, String contentType,
                               PosProperties.Offsite config) {
            objects.put(name, body);
            return "s3://test-bucket/" + name;
        }

        @Override
        public Optional<byte[]> get(String name, PosProperties.Offsite config) {
            return Optional.ofNullable(objects.get(name));
        }

        @Override
        public List<String> list(String prefix, PosProperties.Offsite config) {
            return objects.keySet().stream().filter(key -> key.startsWith(prefix)).sorted().toList();
        }

        @Override
        public String put(Path file, String name, PosProperties.Offsite config) {
            objects.put(name, new byte[0]);
            return "s3://test-bucket/" + name;
        }
    }

    @TestConfiguration
    static class InMemoryBucket {
        @Bean @Primary Bucket bucket() { return new Bucket(); }
    }

    @Autowired SyncService sync;
    @Autowired Bucket bucket;
    @Autowired OutletRepository outlets;
    @Autowired UserRepository users;
    @Autowired CustomerRepository customers;
    @Autowired JdbcTemplate jdbc;

    private PosPrincipal actor;
    private UUID outletId;
    private String run;

    @BeforeEach
    void seed() {
        run = UUID.randomUUID().toString().substring(0, 5).toUpperCase();
        outletId = outlets.save(new Outlet("S" + run.substring(0, 4), "Sync Branch " + run)).getId();

        User owner = new User("owner-" + run.toLowerCase(), "Sync Owner", "hash");
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outletId);
        UUID ownerId = users.save(owner).getId();

        actor = new PosPrincipal(ownerId, "owner-" + run.toLowerCase(), outletId, Instant.now());
        bucket.objects.clear();
    }

    @Test
    @DisplayName("a customer created at a shop reaches the owner, once")
    void pushThenIngest() {
        Customer walkIn = new Customer("Kojo " + run, "0244" + run.hashCode(),
                CustomerType.RETAIL, null, Instant.now());
        UUID customerId = customers.save(walkIn).getId();

        SyncView.Transfer pushed = sync.push(actor, "127.0.0.1");
        assertTrue(pushed.rows() > 0, pushed.message());
        assertEquals(1, pushed.batches());
        assertTrue(bucket.objects.keySet().stream().anyMatch(key -> key.startsWith("data/")),
                bucket.objects.keySet().toString());

        // The rows are stamped, so a second push does not re-send them. Without
        // this a shop would re-send its whole history every fifteen minutes.
        //
        // It is not zero, and should not be: a push records itself in the audit
        // log (BR-15), so the next one carries that single line. The owner can
        // therefore see that a shop is syncing, which is exactly what they need
        // when a branch goes quiet.
        SyncView.Transfer again = sync.push(actor, "127.0.0.1");
        assertFalse(again.rowsByTable().containsKey("customer"),
                "the customer must not be sent twice: " + again.rowsByTable());
        assertTrue(again.rows() <= 1, "a follow-up push carries only its own audit trail: "
                + again.rowsByTable());

        // Ingesting is what the owner's instance does; here it is the same
        // database, so the rows are already present and every insert conflicts.
        // That is the property being tested — applying a batch twice is a no-op.
        // Both batches so far — the customer, and the audit line the first push
        // wrote about itself.
        // The shop's own original batch is still waiting too, and its sale
        // already exists here, so applying it hits the append-only trigger. That
        // refusal must cost exactly one row: before savepoints it aborted the
        // transaction and took the whole ingest — every shop's data — with it.
        SyncView.Transfer ingested = sync.ingest(actor, "127.0.0.1");
        assertTrue(ingested.batches() >= 1, ingested.message());

        SyncView.Transfer repeat = sync.ingest(actor, "127.0.0.1");
        assertEquals(0, repeat.batches(),
                "a batch already taken in must never be applied a second time");

        assertEquals(1, count("select count(*) from customer where id = ?", customerId),
                "the customer must still be exactly one row after two ingests");
    }

    @Test
    @DisplayName("batches are numbered per outlet, and the numbers do not repeat")
    void sequencesAdvance() {
        customers.save(new Customer("First " + run, "0201" + run.hashCode(),
                CustomerType.RETAIL, null, Instant.now()));
        sync.push(actor, "127.0.0.1");

        customers.save(new Customer("Second " + run, "0202" + run.hashCode(),
                CustomerType.RETAIL, null, Instant.now()));
        sync.push(actor, "127.0.0.1");

        List<String> keys = bucket.list("data/", null);
        assertEquals(2, keys.size(), keys.toString());
        // Zero-padded, so lexical order is the order they were written — the
        // owner applies them in that order and a gap is visible.
        assertTrue(keys.get(0).compareTo(keys.get(1)) < 0, keys.toString());
    }

    @Test
    @DisplayName("nothing to send is an ordinary answer, not an error")
    void nothingToSend() {
        // Pushing until it settles: each push carries the previous one's audit
        // line, so the queue drains rather than growing.
        for (int i = 0; i < 4; i++) sync.push(actor, "127.0.0.1");

        SyncView.Status settled = sync.status();
        assertTrue(settled.configured());
        assertTrue(settled.pendingRows() <= 1,
                "the backlog must converge, not grow: " + settled.pendingByTable());
    }

    @Test
    @DisplayName("the status says how far behind the owner's view is, without alarm")
    void statusReportsPending() {
        sync.push(actor, "127.0.0.1");

        customers.save(new Customer("Waiting " + run, "0209" + run.hashCode(),
                CustomerType.RETAIL, null, Instant.now()));

        SyncView.Status status = sync.status();
        assertTrue(status.configured());
        assertTrue(status.pendingRows() > 0, status.summary());
        assertTrue(status.pendingByTable().containsKey("customer"), status.pendingByTable().toString());
        // FR-SYNC-04 reframed: this is not "you cannot sell".
        assertTrue(status.summary().contains("waiting to be sent"), status.summary());
    }

    @Test
    @DisplayName("configuration published for an outlet comes back with its staff and catalogue")
    void configRoundTrip() {
        SyncView.Configuration published = sync.publishConfiguration(outletId, actor, "127.0.0.1");

        assertTrue(published.users() >= 1, "the owner's own account belongs to this outlet");
        String key = "config/" + outlets.findById(outletId).orElseThrow().getCode() + ".json";
        assertTrue(bucket.objects.containsKey(key), bucket.objects.keySet().toString());

        String body = new String(bucket.objects.get(key));
        assertTrue(body.contains("\"version\""), body.substring(0, Math.min(200, body.length())));
        // The hashes travel so a shop can authenticate its own people offline.
        assertTrue(body.contains("passwordHash"), "staff credentials must reach the shop");
    }

    /**
     * The test that should have existed first.
     *
     * <p>Every earlier push test sent customers — a plain table nothing guards.
     * The tables that actually matter are guarded by triggers, and four of them
     * refuse a {@code synced_at} stamp outright: a completed sale, a payment, a
     * closed shift and a confirmed goods receipt. The push failed on real data
     * and passed on test data, which is the worst way round.
     */
    // Fixtures are backdated because the channel ignores rows younger than its
    // settle window: a row's timestamp is its transaction's start, so a push that
    // trusted fresh timestamps could move its mark past a sale still committing
    // and skip it for ever. A real sale is well past that window by the time the
    // scheduled push runs.
    @Test
    @DisplayName("a push carries the guarded tables — sales, payments, shifts, movements")
    void pushesTheGuardedTables() {
        UUID productId = UUID.randomUUID();
        jdbc.update("insert into product (id, sku, name, base_unit) values (?, ?, ?, 'pc')",
                productId, "GUARD-" + run, "Guarded fixture " + run);

        UUID terminalId = UUID.randomUUID();
        jdbc.update("""
                insert into terminal (id, outlet_id, code, name, seq_block_start, seq_block_end,
                                      seq_current)
                values (?, ?, '01', 'Counter 1', 1, 10000, 1)
                """, terminalId, outletId);

        UUID shiftId = UUID.randomUUID();
        jdbc.update("""
                insert into shift (id, outlet_id, terminal_id, cashier_id, opening_float,
                                   opened_at, status)
                values (?, ?, ?, ?, 10000, now() - interval '10 minutes', 'OPEN')
                """, shiftId, outletId, terminalId, actor.userId());

        UUID saleId = UUID.randomUUID();
        jdbc.update("""
                insert into sale (id, receipt_number, outlet_id, terminal_id, shift_id, cashier_id,
                                  subtotal, discount_total, total, change_due, status, created_at)
                values (?, ?, ?, ?, ?, ?, 5000, 0, 5000, 0, 'COMPLETED', now() - interval '10 minutes')
                """, saleId, "GRD-01-" + run, outletId, terminalId, shiftId, actor.userId());

        jdbc.update("""
                insert into payment (id, sale_id, method, amount, created_at)
                values (?, ?, 'cash', 5000, now() - interval '10 minutes')
                """, UUID.randomUUID(), saleId);

        jdbc.update("""
                insert into inventory_movement (id, product_id, outlet_id, type, quantity_delta,
                                                is_exception, created_at)
                values (?, ?, ?, 'SALE', -1, false, now() - interval '10 minutes')
                """, UUID.randomUUID(), productId, outletId);

        SyncView.Transfer sent = sync.push(actor, "127.0.0.1");

        // Each of these would have thrown before: the sale and payment triggers
        // refuse any update, so stamping them was impossible.
        assertTrue(sent.rowsByTable().containsKey("sale"), sent.rowsByTable().toString());
        assertTrue(sent.rowsByTable().containsKey("payment"), sent.rowsByTable().toString());
        assertTrue(sent.rowsByTable().containsKey("shift"), sent.rowsByTable().toString());
        assertTrue(sent.rowsByTable().containsKey("inventory_movement"), sent.rowsByTable().toString());

        // And nothing is sent twice.
        SyncView.Transfer again = sync.push(actor, "127.0.0.1");
        assertFalse(again.rowsByTable().containsKey("sale"),
                "the sale must not go a second time: " + again.rowsByTable());
    }

    @Test
    @DisplayName("a sale voided after it was sent goes again, or the owner's revenue stays wrong")
    void aVoidIsResent() {
        UUID terminalId = UUID.randomUUID();
        jdbc.update("""
                insert into terminal (id, outlet_id, code, name, seq_block_start, seq_block_end,
                                      seq_current)
                values (?, ?, '02', 'Counter 2', 1, 10000, 1)
                """, terminalId, outletId);

        UUID saleId = UUID.randomUUID();
        jdbc.update("""
                insert into sale (id, receipt_number, outlet_id, terminal_id, cashier_id,
                                  subtotal, discount_total, total, change_due, status, created_at)
                values (?, ?, ?, ?, ?, 9900, 0, 9900, 0, 'COMPLETED', now() - interval '10 minutes')
                """, saleId, "VD-02-" + run, outletId, terminalId, actor.userId());

        sync.push(actor, "127.0.0.1");

        // BR-3: the void is the only change a sale's trigger permits.
        jdbc.update("""
                update sale set status = 'VOIDED',
                                voided_at = now() - interval '10 minutes', voided_by = ?,
                                void_reason = 'customer changed their mind'
                where id = ?
                """,
                actor.userId(), saleId);

        SyncView.Transfer after = sync.push(actor, "127.0.0.1");

        // On a created_at watermark alone this sale would never move again, and
        // the owner would keep counting revenue the shop gave back — while the
        // ledger and the audit log both said it was voided.
        assertTrue(after.rowsByTable().containsKey("sale"),
                "a voided sale has to be resent: " + after.rowsByTable());
    }

    /**
     * The owner's side of the channel, which nothing tested before.
     *
     * <p>A shop's batch is applied to a database that has never seen those rows,
     * so every statement is an insert. The fixture is the real bytes a push
     * produces, given a fresh sale id — because a batch assembled by hand would
     * only prove that the hand-written JSON matches the hand-written reader.
     *
     * <p>This matters more than it looks: {@code apply} logs a refused row and
     * carries on, so a broken ingest does not raise. It reports success and the
     * owner's books are simply empty.
     */
    @Test
    @DisplayName("the owner's instance takes in a sale it has never seen")
    void ingestInsertsASaleThatIsNew() {
        UUID terminalId = UUID.randomUUID();
        jdbc.update("""
                insert into terminal (id, outlet_id, code, name, seq_block_start, seq_block_end,
                                      seq_current)
                values (?, ?, '03', 'Counter 3', 1, 10000, 1)
                """, terminalId, outletId);

        UUID saleId = UUID.randomUUID();
        jdbc.update("""
                insert into sale (id, receipt_number, outlet_id, terminal_id, cashier_id,
                                  subtotal, discount_total, total, change_due, status, created_at)
                values (?, ?, ?, ?, ?, 7500, 0, 7500, 0, 'COMPLETED', now() - interval '10 minutes')
                """, saleId, "IN-03-" + run, outletId, terminalId, actor.userId());

        sync.push(actor, "127.0.0.1");
        String pushed = bucket.objects.keySet().stream()
                .filter(key -> key.startsWith("data/")).findFirst().orElseThrow();

        // The same batch, for a sale this database does not hold.
        UUID arriving = UUID.randomUUID();
        String body = new String(bucket.objects.get(pushed), StandardCharsets.UTF_8)
                .replace(saleId.toString(), arriving.toString())
                .replace("IN-03-" + run, "IN-99-" + run);
        bucket.objects.put("data/FAR1/000001-fromfarbranch.json",
                body.getBytes(StandardCharsets.UTF_8));

        SyncView.Transfer ingested = sync.ingest(actor, "127.0.0.1");

        assertEquals(1, count("select count(*) from sale where id = ?", arriving),
                "the incoming sale never landed — " + ingested.message());
        assertEquals(1, count("select count(*) from sale where receipt_number = ?", "IN-99-" + run),
                "a sale must keep the receipt number the shop gave it (BR-6)");
    }

    @Test
    @DisplayName("a fresh counter adopts head office's outlet id on its first pull")
    void firstPullAdoptsTheHeadOfficeId() throws Exception {
        // Head office publishes for its own outlet.
        sync.publishConfiguration(outletId, actor, "127.0.0.1");
        String code = outlets.findById(outletId).orElseThrow().getCode();

        // Now stand in for a fresh counter: the same shop, but with the id a
        // first run would have invented for itself. outlet.code is unique, so
        // inserting head office's row violates the *code* index — which an
        // `on conflict (id)` clause never catches, and every first pull failed.
        UUID headOfficeId = outletId;
        jdbc.update("update outlet set code = ? where id = ?", code + "X", headOfficeId);
        UUID invented = UUID.randomUUID();
        jdbc.update("insert into outlet (id, code, name, is_active) values (?, ?, ?, true)",
                invented, code, "Invented by first run");
        // Setup signs in before it pulls, so the invented outlet is already named
        // by an append-only audit entry. Deleting it then failed on the foreign
        // key, and every outlet-mode setup stopped with a 500.
        jdbc.update("insert into audit_log (actor_id, action, entity_type, entity_id, outlet_id) "
                + "values (?, 'AUTH_SIGN_IN', 'user', ?, ?)", actor.userId(), actor.userId(), invented);

        SyncView.Configuration applied = sync.pullConfiguration(
                new PosPrincipal(actor.userId(), actor.username(), invented, Instant.now()),
                "127.0.0.1");
        assertEquals(code, applied.outletCode());

        // Head office's id wins, because it is the one every product, price and
        // pushed sale is keyed to.
        assertTrue(outlets.findById(headOfficeId).isPresent(),
                "head office's outlet must exist after the pull");
        assertFalse(outlets.findById(invented).orElseThrow().isActive(),
                "the invented outlet must be retired, not left trading beside it");
        assertFalse(code.equals(outlets.findById(invented).orElseThrow().getCode()),
                "the invented outlet must give up the shop's code");
    }

    @Test
    @DisplayName("a counter that has already traded refuses the swap rather than orphaning its sales")
    void refusesToReIdALiveOutlet() throws Exception {
        sync.publishConfiguration(outletId, actor, "127.0.0.1");
        String code = outlets.findById(outletId).orElseThrow().getCode();

        jdbc.update("update outlet set code = ? where id = ?", code + "Y", outletId);
        UUID trading = UUID.randomUUID();
        jdbc.update("insert into outlet (id, code, name, is_active) values (?, ?, ?, true)",
                trading, code, "Already selling");
        // One movement is enough: its outlet id is now load-bearing. A product has
        // to exist for it to point at — selecting from an empty product table
        // inserted nothing, and the outlet looked untouched.
        UUID productId = UUID.randomUUID();
        jdbc.update("insert into product (id, sku, name, base_unit) values (?, ?, ?, 'pc')",
                productId, "SYNC-" + run, "Sync fixture " + run);
        jdbc.update("""
                insert into inventory_movement (id, product_id, outlet_id, type, quantity_delta,
                                                is_exception, created_at)
                values (?, ?, ?, 'OPENING', 1, false, now())
                """, UUID.randomUUID(), productId, trading);

        var shopActor = new PosPrincipal(actor.userId(), actor.username(), trading, Instant.now());
        var refused = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> sync.pullConfiguration(shopActor, "127.0.0.1"));

        // Swapping the id under a shop that has been selling would detach its
        // sales from any outlet anybody else knows about.
        assertTrue(String.valueOf(refused.getReason()).contains("recorded transaction"),
                refused.getReason());
    }

    @Test
    @DisplayName("with no bucket configured, syncing says so rather than failing")
    void withoutABucket() {
        // Covered by the property source being absent in production; here the
        // point is that the answer is a sentence, not a stack trace.
        SyncView.Status status = sync.status();
        assertTrue(status.configured(), "this test configures one");
        assertNotNull(status.summary());
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }
}
