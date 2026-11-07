package gh.giftedlabs.pos.security;

import gh.giftedlabs.pos.TestcontainersConfiguration;
import gh.giftedlabs.pos.rules.Permission;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * NFR-9: the interface is never the only control.
 *
 * <p>Written because granting a permission had twice turned out to mean nothing.
 * The Theme tab was gated in the frontend on {@code settings.appearance} while its
 * save went through an endpoint demanding {@code settings.general}, so a user
 * given appearance alone saw the tab and every click failed; and
 * {@code sale.discount} was never checked at all, so revoking it hid the control
 * on screen and the server took the discount anyway.
 *
 * <p>Both are the same bug: a right that exists on the screen and not on the
 * server. These tests read the actual handler methods rather than a list somebody
 * maintains, so the next one fails here instead of in a shop.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@DisplayName("Permission enforcement — NFR-9")
class PermissionEnforcementTest {

    /** Pulls the quoted codes out of a {@code hasAuthority('...')} expression. */
    private static final Pattern AUTHORITY = Pattern.compile("'([a-z_]+\\.[a-z_]+)'");

    /**
     * Qualified by name: Actuator contributes a second
     * {@code RequestMappingHandlerMapping} for its own endpoints, and this test is
     * about the application's routes.
     */
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping handlers;

    /**
     * Codes with no endpoint, each for a stated reason.
     *
     * <p>This is the list an owner is entitled to see: granting one of these
     * changes what the screen offers and nothing a server enforces, because the
     * feature behind it does not exist yet. Deleting a line from here without
     * building the endpoint is what the test below prevents.
     */
    private static final Map<Permission, String> NO_ENDPOINT_YET = Map.of(
            // Settled 2026-09-15: stock does not move between the shops. Every item
            // at an outlet belongs to that outlet, so there is no transfer to build
            // and this stays a Stage 3 placeholder — the last code in this map.
            Permission.STOCK_TRANSFER, "Stage 3 — stock does not move between outlets for this client");

    /**
     * Codes enforced inside an operation rather than on the route.
     *
     * <p>Some rights cannot be a route guard because they change what an allowed
     * request <em>does</em>: {@code report.view_profit} withholds cost from a
     * report the caller may otherwise read, {@code stock.oversell} decides whether
     * a sale may pass zero, {@code sale.discount} whether the discount is allowed
     * at all. Pinned as a named set so a new code cannot quietly join them — the
     * next one has to be justified here.
     */
    private static final Set<String> ENFORCED_IN_LOGIC = Set.of(
            Permission.Codes.OUTLET_VIEW_ALL,
            Permission.Codes.REPORT_VIEW_PROFIT,
            Permission.Codes.SALE_APPROVE_BELOW_FLOOR,
            Permission.Codes.SALE_DISCOUNT,
            Permission.Codes.STOCK_APPROVE_ADJUSTMENT,
            Permission.Codes.STOCK_OVERSELL);

    @Test
    @DisplayName("every permission is enforced somewhere, or listed as not yet built")
    void everyCodeIsEnforcedSomewhere() {
        Set<String> enforced = new TreeSet<>(enforcedCodes());
        enforced.addAll(codesCheckedInSource());

        List<String> unenforced = Arrays.stream(Permission.values())
                .filter(permission -> !enforced.contains(permission.code()))
                .filter(permission -> !NO_ENDPOINT_YET.containsKey(permission))
                .map(Permission::code)
                .sorted()
                .toList();

        assertTrue(unenforced.isEmpty(),
                ("These permissions are granted in the matrix and checked by no endpoint, so "
                        + "granting or revoking one changes the screen and nothing else: %s. "
                        + "Either authorise a route against the code, or add it to "
                        + "NO_ENDPOINT_YET with the reason.").formatted(unenforced));
    }

    @Test
    @DisplayName("nothing in NO_ENDPOINT_YET has quietly grown an endpoint")
    void exemptionsStayHonest() {
        Set<String> enforced = enforcedCodes();

        // The reverse direction. A code that gains a route should lose its
        // exemption, or the list stops describing the system and starts
        // excusing it.
        List<String> nowEnforced = NO_ENDPOINT_YET.keySet().stream()
                .filter(permission -> enforced.contains(permission.code()))
                .map(Permission::code)
                .sorted()
                .toList();

        assertTrue(nowEnforced.isEmpty(),
                "These are enforced now and should come off NO_ENDPOINT_YET: " + nowEnforced);
    }

    @Test
    @DisplayName("every code named in a @PreAuthorize is a real permission")
    void noTyposInAuthorityStrings() {
        List<String> unknown = enforcedCodes().stream()
                .filter(code -> Permission.ofCode(code).isEmpty())
                .sorted()
                .toList();

        // A typo in a hasAuthority string is a route nobody can ever reach, and
        // it fails as a 403 that looks exactly like a permission problem.
        assertTrue(unknown.isEmpty(),
                "These strings are authorised against and are not permissions: " + unknown);
    }

    @Test
    @DisplayName("every state-changing endpoint is authorised, not merely authenticated")
    void mutatingRoutesAreGuarded() {
        List<String> unguarded = new ArrayList<>();

        handlers.getHandlerMethods().forEach((info, handler) -> {
            if (!isOurs(handler)) return;
            if (!changesState(info)) return;

            PreAuthorize annotation = annotation(handler);
            String expression = annotation == null ? "" : annotation.value();

            // isAuthenticated() alone is not authorisation: it means any signed-in
            // person, which for a write is every cashier in the shop.
            boolean guarded = expression.contains("hasAuthority") || expression.contains("hasAnyAuthority");
            if (!guarded) {
                unguarded.add("%s %s -> %s#%s (%s)".formatted(
                        methods(info), patterns(info),
                        handler.getBeanType().getSimpleName(), handler.getMethod().getName(),
                        expression.isBlank() ? "no @PreAuthorize" : expression));
            }
        });

        // The exceptions are the routes that establish or end a session, which
        // cannot require a permission held by a session that does not exist yet.
        List<String> unexpected = unguarded.stream()
                .filter(route -> !route.contains("AuthController"))
                .sorted()
                .toList();

        assertTrue(unexpected.isEmpty(),
                "These endpoints change state with no permission behind them:\n  "
                        + String.join("\n  ", unexpected));
    }

    @Test
    @DisplayName("the accounting module's routes are behind their own codes")
    void accountingRoutesUseTheNewCodes() {
        Map<String, Set<String>> byRoute = routesToCodes();

        // Named explicitly rather than counted, because the point of these three
        // codes is which route each one guards.
        assertEquals(Set.of(Permission.Codes.EXPENSE_VIEW), byRoute.get("GET /api/expenses"));
        assertEquals(Set.of(Permission.Codes.EXPENSE_MANAGE), byRoute.get("POST /api/expenses"));
        assertEquals(Set.of(Permission.Codes.EXPENSE_MANAGE), byRoute.get("DELETE /api/expenses/{id}"));
        assertEquals(Set.of(Permission.Codes.REPORT_VIEW_PL),
                byRoute.get("GET /api/reports/profit-and-loss"));
        assertEquals(Set.of(Permission.Codes.CUSTOMER_CREDIT),
                byRoute.get("POST /api/installment-plans"));

        // Writing a debt off takes both: running plans, and the authority to
        // decide the shop will not collect.
        assertEquals(Set.of(Permission.Codes.CUSTOMER_CREDIT, Permission.Codes.SETTINGS_GENERAL),
                byRoute.get("POST /api/installment-plans/{id}/default"));

        // Sending the day up is not the same right as changing the business.
        // Pushing is one-way, additive and audited; pulling configuration rewrites
        // this counter's users and can move its outlet id, so the two are split
        // and the safe half is the one a cashier holds.
        assertEquals(Set.of(Permission.Codes.SYNC_PUSH), byRoute.get("POST /api/sync/push"));
        assertEquals(Set.of(Permission.Codes.SYNC_PUSH), byRoute.get("GET /api/sync/status"));
        assertEquals(Set.of(Permission.Codes.SETTINGS_GENERAL), byRoute.get("POST /api/sync/config"));
        assertEquals(Set.of(Permission.Codes.SETTINGS_GENERAL), byRoute.get("POST /api/sync/ingest"));

        // Purchase orders sit with whoever keeps the shelves full, which is the
        // code the screen inventory already assigns to the workspace.
        assertEquals(Set.of(Permission.Codes.SUPPLIER_MANAGE), byRoute.get("POST /api/purchase-orders"));
        assertEquals(Set.of(Permission.Codes.SUPPLIER_MANAGE),
                byRoute.get("POST /api/purchase-orders/{id}/close"));

        // Returns: reading a credit note needs the same right as making one. It
        // says what the shop paid back and why.
        assertEquals(Set.of(Permission.Codes.SALE_REFUND), byRoute.get("POST /api/returns"));
        assertEquals(Set.of(Permission.Codes.SALE_REFUND), byRoute.get("GET /api/returns"));
        assertEquals(Set.of(Permission.Codes.SALE_REFUND),
                byRoute.get("GET /api/returns/returnable/{saleId}"));

        // The expenses screen used to be gated on cash.movement, which meant
        // anyone who could bank the takings could read the payroll.
        assertFalse(byRoute.getOrDefault("GET /api/expenses", Set.of())
                        .contains(Permission.Codes.CASH_MOVEMENT),
                "expenses must not be reachable through the drawer's permission");
    }

    @Test
    @DisplayName("changing the accent does not require general-settings authority")
    void appearanceIsIndependentlyGrantable() {
        Map<String, Set<String>> byRoute = routesToCodes();

        Set<String> codes = byRoute.get("PUT /api/settings/appearance");
        assertNotNull(codes, "There is no appearance-only endpoint. The Theme tab is gated on "
                + "settings.appearance, so without one a user granted only that code sees the "
                + "tab and every save fails.");
        assertEquals(Set.of(Permission.Codes.SETTINGS_APPEARANCE), codes,
                "the accent must be changeable with settings.appearance alone");
    }

    @Test
    @DisplayName("the codes enforced only inside an operation are exactly the expected ones")
    void inLogicEnforcementIsPinned() {
        Set<String> routeGuarded = enforcedCodes();

        Set<String> onlyInLogic = Arrays.stream(Permission.values())
                .map(Permission::code)
                .filter(code -> !routeGuarded.contains(code))
                .filter(code -> codesCheckedInSource().contains(code))
                .collect(Collectors.toCollection(TreeSet::new));

        // If this fails because something moved to a route guard, take it out of
        // ENFORCED_IN_LOGIC. If it fails because a new code appeared here, ask
        // whether it should have been a route guard instead — that is the
        // question this test exists to force.
        assertEquals(new TreeSet<>(ENFORCED_IN_LOGIC), onlyInLogic,
                "the set of permissions enforced mid-operation has changed");
    }

    // --- internals ---------------------------------------------------------

    /**
     * Codes named in the main sources outside the catalogue itself.
     *
     * <p>Reads the source tree rather than reflecting, because an in-logic check
     * is an ordinary method call with nothing to reflect on. {@code Permission.java}
     * and {@code Role.java} are excluded: one declares the codes and the other
     * lists them in baselines, so counting either would make every code look
     * enforced.
     */
    private Set<String> codesCheckedInSource() {
        Path root = Path.of("src", "main", "java");
        Set<String> found = new TreeSet<>();
        Pattern reference = Pattern.compile("(?:Permission|Codes)\\.([A-Z][A-Z_]+)\\b");

        try (var files = Files.walk(root)) {
            files.filter(file -> file.toString().endsWith(".java"))
                    .filter(file -> {
                        String name = file.getFileName().toString();
                        return !name.equals("Permission.java") && !name.equals("Role.java");
                    })
                    .forEach(file -> {
                        try {
                            Matcher matcher = reference.matcher(Files.readString(file));
                            while (matcher.find()) {
                                try {
                                    found.add(Permission.valueOf(matcher.group(1)).code());
                                } catch (IllegalArgumentException notAPermission) {
                                    // Codes.<something else>, or an unrelated constant.
                                }
                            }
                        } catch (IOException unreadable) {
                            fail("Could not read " + file, unreadable);
                        }
                    });
        } catch (IOException unreadable) {
            fail("Could not walk " + root.toAbsolutePath(), unreadable);
        }
        return found;
    }

    private Set<String> enforcedCodes() {
        Set<String> codes = new TreeSet<>();
        handlers.getHandlerMethods().forEach((info, handler) -> {
            if (!isOurs(handler)) return;
            PreAuthorize annotation = annotation(handler);
            if (annotation == null) return;
            Matcher matcher = AUTHORITY.matcher(annotation.value());
            while (matcher.find()) codes.add(matcher.group(1));
        });
        return codes;
    }

    /** "GET /api/expenses" → the codes its {@code @PreAuthorize} names. */
    private Map<String, Set<String>> routesToCodes() {
        Map<String, Set<String>> byRoute = new TreeMap<>();
        handlers.getHandlerMethods().forEach((info, handler) -> {
            if (!isOurs(handler)) return;
            PreAuthorize annotation = annotation(handler);
            Set<String> codes = new TreeSet<>();
            if (annotation != null) {
                Matcher matcher = AUTHORITY.matcher(annotation.value());
                while (matcher.find()) codes.add(matcher.group(1));
            }
            for (String method : methods(info).split(",")) {
                if (method.isBlank()) continue;
                byRoute.put(method.trim() + " " + patterns(info), codes);
            }
        });
        return byRoute;
    }

    /**
     * The annotation, from the method or its class.
     *
     * <p>Class-level {@code @PreAuthorize} counts: a controller guarded once at
     * the top is guarded, and missing that would make this test demand
     * annotations the framework does not need.
     */
    private PreAuthorize annotation(HandlerMethod handler) {
        Method method = handler.getMethod();
        PreAuthorize onMethod = method.getAnnotation(PreAuthorize.class);
        return onMethod != null ? onMethod : handler.getBeanType().getAnnotation(PreAuthorize.class);
    }

    private boolean isOurs(HandlerMethod handler) {
        return handler.getBeanType().getPackageName().startsWith("gh.giftedlabs.pos");
    }

    private boolean changesState(RequestMappingInfo info) {
        Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
        // An empty condition maps every verb, which includes the writing ones.
        if (methods.isEmpty()) return true;
        return methods.stream().anyMatch(method -> method == RequestMethod.POST
                || method == RequestMethod.PUT
                || method == RequestMethod.PATCH
                || method == RequestMethod.DELETE);
    }

    private String methods(RequestMappingInfo info) {
        return info.getMethodsCondition().getMethods().stream()
                .map(Enum::name).sorted().collect(Collectors.joining(","));
    }

    private String patterns(RequestMappingInfo info) {
        if (info.getPathPatternsCondition() != null) {
            return info.getPathPatternsCondition().getPatterns().stream()
                    .map(Object::toString).sorted().collect(Collectors.joining(","));
        }
        return String.join(",", new TreeSet<>(info.getPatternValues()));
    }
}
