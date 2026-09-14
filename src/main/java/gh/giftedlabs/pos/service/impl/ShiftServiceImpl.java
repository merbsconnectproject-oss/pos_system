package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.ShiftView;
import gh.giftedlabs.pos.entity.CashMovement;
import gh.giftedlabs.pos.entity.Shift;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.exception.ShiftException;
import gh.giftedlabs.pos.repository.ShiftRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.CashMovementType;
import gh.giftedlabs.pos.rules.PaymentMethod;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.ShiftService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.util.*;

/**
 * Shifts and the cash drawer — FR-CASH, BR-13, BR-14.
 *
 * <p>Expected cash is computed from the payments and movements every time it is
 * asked for, never kept as a running total on the shift. A stored total is a
 * second record of what the payments already say, and after one void only one
 * of them can be right.
 */
@Service
public class ShiftServiceImpl implements ShiftService {

    private final ShiftRepository shifts;
    private final TerminalRepository terminals;
    private final UserRepository users;
    private final AuditService audit;
    private final Clock clock;

    public ShiftServiceImpl(ShiftRepository shifts, TerminalRepository terminals, UserRepository users,
                            AuditService audit, Clock clock) {
        this.shifts = shifts;
        this.terminals = terminals;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * FR-CASH-01 · BR-13: open a shift with a declared float.
     *
     * <p>The partial unique indexes are what enforce "one per user, one per
     * till". They are checked here too, but only so the answer is a sentence
     * rather than a constraint name — two sign-ins racing would both pass a
     * check and only one can pass an index.
     */
    @Override
    @Transactional
    public ShiftView open(UUID terminalId, long openingFloat, PosPrincipal actor, String clientIp) {
        if (openingFloat < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An opening float cannot be negative");
        }

        Terminal terminal = terminals.findById(terminalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such till"));

        shifts.findOpenForCashier(actor.userId()).ifPresent(open -> {
            throw ShiftException.cashierAlreadyOpen(open.getId());
        });
        shifts.findOpenForTerminal(terminalId).ifPresent(open -> {
            throw ShiftException.terminalAlreadyOpen(terminal.getCode(),
                    users.findById(open.getCashierId()).map(u -> u.getFullName()).orElse("someone else"));
        });

        Shift shift = new Shift(terminal.getOutletId(), terminalId, actor.userId(), openingFloat, clock.instant());

        Shift saved;
        try {
            saved = shifts.saveAndFlush(shift);
        } catch (DataIntegrityViolationException raced) {
            // The index caught what the check could not: another request opened
            // a shift between the two.
            throw ShiftException.cashierAlreadyOpen(null);
        }

        audit.record(actor.userId(), "SHIFT_OPENED", "shift", saved.getId(), null,
                Map.of("openingFloat", openingFloat, "terminal", terminal.getCode()),
                terminal.getOutletId(), terminalId, clientIp);

        return view(saved);
    }

    /**
     * FR-CASH-04/05/06 · BR-14: close on a blind count.
     *
     * <p>The caller sends only what was counted. What was expected is worked out
     * here and returned with the variance — so the count cannot be reverse
     * engineered from the answer, which is the whole point of a blind close.
     */
    @Override
    @Transactional
    public ShiftView close(UUID shiftId, long countedCash, String note, long varianceThreshold,
                           PosPrincipal actor, String clientIp) {
        Shift shift = shifts.findById(shiftId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such shift"));
        if (!shift.isOpen()) throw ShiftException.alreadyClosed();

        long expected = expectedCash(shift);
        long variance = countedCash - expected;

        // FR-CASH-06: past the threshold it has to be explained. Checked before
        // anything is written, so a refused close leaves the shift open.
        if (Math.abs(variance) > varianceThreshold && (note == null || note.isBlank())) {
            throw ShiftException.varianceNeedsExplanation(variance, varianceThreshold);
        }

        shift.close(countedCash, expected, note == null || note.isBlank() ? null : note.trim(),
                actor.userId(), clock.instant());

        audit.record(actor.userId(), "SHIFT_CLOSED", "shift", shiftId, null,
                Map.of("counted", countedCash, "expected", expected, "variance", variance,
                        "note", note == null ? "" : note),
                shift.getOutletId(), shift.getTerminalId(), clientIp);

        return view(shift);
    }

    /** FR-CASH-03. */
    @Override
    @Transactional
    public ShiftView recordCash(UUID shiftId, CashMovementType type, long amount, String reason,
                                String note, PosPrincipal actor, String clientIp) {
        Shift shift = shifts.findById(shiftId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such shift"));
        if (!shift.isOpen()) throw ShiftException.alreadyClosed();
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A cash movement needs a reason");
        }

        long magnitude = Math.abs(amount);
        if (magnitude == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter an amount");
        }
        // The sign is the type's: a payout entered as a positive number would be
        // a way to invent money in the drawer.
        long signed = type.increases() ? magnitude : -magnitude;

        shift.addCashMovement(new CashMovement(type, signed, reason.trim(),
                note == null || note.isBlank() ? null : note.trim(), actor.userId()));

        audit.record(actor.userId(), "CASH_" + type.name(), "shift", shiftId, null,
                Map.of("amount", signed, "reason", reason.trim()),
                shift.getOutletId(), shift.getTerminalId(), clientIp);

        return view(shift);
    }

    /** FR-POS-02: which shift a sale belongs to, if any is open. */
    @Override
    @Transactional(readOnly = true)
    public Optional<UUID> openShiftFor(UUID cashierId) {
        return shifts.findOpenForCashier(cashierId).map(Shift::getId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ShiftView> current(UUID cashierId) {
        return shifts.findOpenForCashier(cashierId).map(this::view);
    }

    @Override
    @Transactional(readOnly = true)
    public ShiftView get(UUID shiftId) {
        return view(shifts.findById(shiftId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such shift")));
    }

    /** FR-CASH-08 · `H-01`. */
    @Override
    @Transactional(readOnly = true)
    public List<ShiftView> recent(UUID outletId, UUID cashierId, int limit) {
        return shifts.recent(outletId, cashierId, PageRequest.of(0, limit)).stream()
                .map(this::view).toList();
    }

    /**
     * BR-14: float + cash sales − cash refunds − cash payouts.
     *
     * <p>Refunds and payouts are the same thing to this sum — money that left
     * the drawer — and both arrive as negative cash movements, so there is one
     * subtraction rather than two that could disagree.
     */
    private long expectedCash(Shift shift) {
        return shift.getOpeningFloat()
                + shifts.cashTakenDuring(shift.getId())
                + shift.netCashMovements();
    }

    /**
     * FR-CASH-04: an open shift reveals nothing that would give the expectation
     * away — not expected cash, not takings, not the sale total. Cash takings
     * plus the float <em>is</em> the expectation, so listing them would make the
     * blind close a formality.
     */
    private ShiftView view(Shift shift) {
        boolean closed = !shift.isOpen();

        Map<String, Long> byMethod = new LinkedHashMap<>();
        Long saleCount = null;
        Long saleTotal = null;

        if (closed) {
            for (Object[] row : shifts.takingsByMethod(shift.getId())) {
                byMethod.put(((PaymentMethod) row[0]).name(), (Long) row[1]);
            }
            Object[] summary = shifts.salesSummary(shift.getId());
            saleCount = summary == null ? 0L : ((Number) summary[0]).longValue();
            saleTotal = summary == null ? 0L : ((Number) summary[1]).longValue();
        }

        List<ShiftView.CashLine> movements = shift.getCashMovements().stream()
                .map(movement -> new ShiftView.CashLine(movement.getId(), movement.getType().name(),
                        movement.getAmount(), movement.getReason(), movement.getNote(),
                        nameOf(movement.getActorId()), movement.getCreatedAt()))
                .toList();

        return new ShiftView(
                shift.getId(), shift.getOutletId(), shift.getTerminalId(),
                shift.getCashierId(), nameOf(shift.getCashierId()),
                shift.getOpeningFloat(), shift.getOpenedAt(), shift.getStatus().name(),
                shift.getCountedCash(), shift.getExpectedCash(),
                shift.getVariance(), shift.getVarianceNote(),
                shift.getClosedAt(), nameOf(shift.getClosedBy()),
                saleCount, saleTotal, byMethod, movements);
    }

    private String nameOf(UUID userId) {
        if (userId == null) return null;
        return users.findById(userId).map(user -> user.getFullName()).orElse("(removed)");
    }
}
