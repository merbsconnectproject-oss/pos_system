package gh.giftedlabs.pos.rules;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.StreamSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The anti-drift test.
 *
 * <p>Reads {@code test-vectors.json} — generated from the frontend's rules by
 * {@code npm run gen:vectors} — and asserts the Java port produces identical
 * results. The frontend's {@code npm run check} reads the same file.
 *
 * <p>Neither implementation owns its expected values. If a vector needs to
 * change it changes in one file, and both suites fail together until they
 * agree. This is the only mechanism keeping a TypeScript frontend and a Java
 * backend honest about money.
 *
 * <p>Decimals arrive as strings and are built with {@code new BigDecimal(String)},
 * which is exact. {@code BigDecimal.valueOf(double)} would re-introduce the
 * binary float error these vectors exist to pin down.
 */
@DisplayName("Domain rules match the frozen contract vectors")
class RulesVectorTest {

    private static final String VECTORS = "/test-vectors.json";
    private static JsonNode root;

    @BeforeAll
    static void load() throws Exception {
        try (InputStream in = RulesVectorTest.class.getResourceAsStream(VECTORS)) {
            assertNotNull(in, """
                    %s not found on the test classpath.
                    Regenerate and sync it:
                      cd ../pos-system && npm run gen:vectors
                      cp docs/contract/test-vectors.json ../pos-api/src/test/resources/
                    """.formatted(VECTORS));
            root = new ObjectMapper().readTree(in);
        }
    }

    private static BigDecimal dec(JsonNode node) {
        return new BigDecimal(node.asText());
    }

    private static Iterable<JsonNode> each(JsonNode node) {
        return node::elements;
    }

    // ---------------------------------------------------------------- BR-11

    @TestFactory
    @DisplayName("BR-11 money rounds half-up, per line")
    List<DynamicTest> money() {
        List<DynamicTest> tests = new ArrayList<>();
        JsonNode money = root.get("money");

        for (JsonNode c : each(money.get("roundMoney"))) {
            tests.add(DynamicTest.dynamicTest("roundMoney(%s) = %s".formatted(c.get("in").asText(), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(), Money.round(dec(c.get("in"))).toPlainString())));
        }

        for (JsonNode c : each(money.get("toPesewas"))) {
            tests.add(DynamicTest.dynamicTest("toPesewas(%s) = %d".formatted(c.get("in").asText(), c.get("out").asLong()),
                    () -> assertEquals(c.get("out").asLong(), Money.toPesewas(dec(c.get("in"))))));
        }

        for (JsonNode c : each(money.get("fromPesewas"))) {
            tests.add(DynamicTest.dynamicTest("fromPesewas(%d) = %s".formatted(c.get("in").asLong(), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(), Money.fromPesewas(c.get("in").asLong()).toPlainString())));
        }

        for (JsonNode c : each(money.get("lineTotal"))) {
            tests.add(DynamicTest.dynamicTest("lineTotal(%s x %s - %s) = %s".formatted(
                    c.get("quantity").asText(), c.get("unitPrice").asText(),
                    c.get("discount").asText(), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(),
                            Money.lineTotal(dec(c.get("quantity")), dec(c.get("unitPrice")), dec(c.get("discount")))
                                    .toPlainString())));
        }

        for (JsonNode c : each(money.get("sumMoney"))) {
            List<BigDecimal> values = StreamSupport
                    .stream(each(c.get("in")).spliterator(), false)
                    .map(RulesVectorTest::dec)
                    .toList();
            tests.add(DynamicTest.dynamicTest("sum(%s) = %s".formatted(c.get("in"), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(), Money.sum(values).toPlainString())));
        }

        return tests;
    }

    // ---------------------------------------------------------------- BR-12

    @TestFactory
    @DisplayName("BR-12 quantities hold 3dp for cut lengths")
    List<DynamicTest> quantity() {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : each(root.get("quantity").get("roundQuantity"))) {
            tests.add(DynamicTest.dynamicTest("roundQuantity(%s) = %s".formatted(c.get("in").asText(), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(), Quantity.round(dec(c.get("in"))).toPlainString())));
        }
        return tests;
    }

    // ----------------------------------------------------------------- BR-4

    @TestFactory
    @DisplayName("BR-4 weighted average cost per outlet")
    List<DynamicTest> weightedAverageCost() {
        List<DynamicTest> tests = new ArrayList<>();

        for (JsonNode c : each(root.get("weightedAverageCost").get("cases"))) {
            tests.add(DynamicTest.dynamicTest("%s @ %s + %s @ %s = %s".formatted(
                    c.get("quantityOnHand").asText(), c.get("currentAverage").asText(),
                    c.get("quantityReceivedBase").asText(), c.get("unitCostPerBase").asText(),
                    c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(),
                            Costing.weightedAverageCost(
                                    dec(c.get("quantityOnHand")),
                                    dec(c.get("currentAverage")),
                                    dec(c.get("quantityReceivedBase")),
                                    dec(c.get("unitCostPerBase"))).toPlainString())));
        }

        for (JsonNode c : each(root.get("costPerBaseUnit").get("cases"))) {
            tests.add(DynamicTest.dynamicTest("costPerBaseUnit(%s / %s) = %s".formatted(
                    c.get("purchaseUnitCost").asText(), c.get("conversionFactor").asText(), c.get("out").asText()),
                    () -> assertEquals(c.get("out").asText(),
                            Money.round(Costing.costPerBaseUnit(
                                    dec(c.get("purchaseUnitCost")), dec(c.get("conversionFactor")))).toPlainString())));
        }

        return tests;
    }

    // ----------------------------------------------------------------- BR-6

    @TestFactory
    @DisplayName("BR-6 receipt numbers are formatted per outlet and terminal")
    List<DynamicTest> receiptNumbers() {
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode c : each(root.get("receiptNumber").get("cases"))) {
            tests.add(DynamicTest.dynamicTest(c.get("out").asText(),
                    () -> assertEquals(c.get("out").asText(),
                            ReceiptSequence.format(
                                    c.get("outletPrefix").asText(),
                                    c.get("terminalCode").asText(),
                                    c.get("sequence").asLong()))));
        }
        return tests;
    }

    @Test
    @DisplayName("BR-6 a block issues exactly its numbers, then refuses")
    void blockExhaustion() {
        JsonNode spec = root.get("receiptNumber").get("blockExhaustion");

        ReceiptSequence.SequenceBlock block = ReceiptSequence.createBlock(
                "INC", "01", spec.get("start").asLong(), spec.get("size").asLong());

        List<String> issued = new ArrayList<>();
        for (JsonNode ignored : each(spec.get("issued"))) {
            ReceiptSequence.IssuedReceipt next = ReceiptSequence.issue(block);
            issued.add(next.receiptNumber());
            block = next.block();
        }

        List<String> expected = StreamSupport
                .stream(each(spec.get("issued")).spliterator(), false)
                .map(JsonNode::asText)
                .toList();
        assertEquals(expected, issued);

        ReceiptSequence.SequenceBlock exhausted = block;
        if (spec.get("thirdCallRefused").asBoolean()) {
            assertThrows(ReceiptSequence.BlockExhaustedException.class,
                    () -> ReceiptSequence.issue(exhausted),
                    "an exhausted block must refuse rather than reissue a number");
        }
        assertEquals(0L, ReceiptSequence.remaining(exhausted));
    }

    // ------------------------------------------------------------------- §6

    @TestFactory
    @DisplayName("PRD §6 role baselines resolve identically")
    List<DynamicTest> permissionMatrix() {
        List<DynamicTest> tests = new ArrayList<>();
        JsonNode roles = root.get("permissions").get("roles");

        roles.fieldNames().forEachRemaining(role -> {
            Set<String> expected = new TreeSet<>();
            for (JsonNode code : each(roles.get(role))) {
                expected.add(code.asText());
            }
            tests.add(DynamicTest.dynamicTest("%s holds %d codes".formatted(role, expected.size()),
                    () -> assertEquals(expected, new TreeSet<>(Permissions.forRole(role)))));
        });

        return tests;
    }

    @Test
    @DisplayName("FR-USER-03 per-user overrides grant and revoke against the baseline")
    void overrides() {
        for (JsonNode c : each(root.get("permissions").get("overrides"))) {
            String role = c.get("baseRole").asText();
            String code = c.get("grants").asText();

            Map<String, Boolean> overrides = new HashMap<>();
            c.get("override").fields().forEachRemaining(e -> overrides.put(e.getKey(), e.getValue().asBoolean()));

            Set<String> resolved = Permissions.resolve(
                    Permissions.DEFAULT_ROLE_PERMISSIONS.get(role), overrides);

            assertEquals(c.get("expected").asBoolean(), resolved.contains(code),
                    "%s with override %s on %s".formatted(role, overrides, code));
        }
    }

    @Test
    @DisplayName("The 33 codes match the frontend, and the two deferred ones are granted to nobody")
    void codeInventory() {
        Set<String> expected = new TreeSet<>();
        for (JsonNode code : each(root.get("permissions").get("allCodes"))) {
            expected.add(code.asText());
        }

        assertEquals(expected, new TreeSet<>(Permissions.ALL));
        assertEquals(33, Permissions.ALL.size(), "PRD §6 documents 31; permissions.ts carries 33");

        // stock.transfer is Stage 3 and customer.credit is Stage 2 — seeded so no
        // migration is needed later. Owner currently holds both, mirroring the
        // frontend; see the open decision on Permissions. No operational role does.
        assertFalse(Permissions.forRole(Permissions.ROLE_CASHIER).contains(Permissions.STOCK_TRANSFER));
        assertFalse(Permissions.forRole(Permissions.ROLE_STOREKEEPER).contains(Permissions.STOCK_TRANSFER));
        assertTrue(Permissions.ALL.contains(Permissions.STOCK_TRANSFER));
        assertTrue(Permissions.ALL.contains(Permissions.CUSTOMER_CREDIT));
    }
}
