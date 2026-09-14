package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.dto.OutletRequest;
import gh.giftedlabs.pos.dto.OutletView;
import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.exception.OutletCodeTakenException;
import gh.giftedlabs.pos.exception.OutletNotFoundException;
import gh.giftedlabs.pos.exception.OutletNotPermittedException;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.AuditService;
import gh.giftedlabs.pos.service.OutletService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Branches — FR-OUT-01…06, BR-17.
 *
 * <p>Reads are scoped here, once. FR-OUT's acceptance criterion is that with
 * Outlet A selected no Outlet B record appears on any list, report or search,
 * and the only way to hold that across sixteen later features is for the scope
 * to be a property of the read rather than something each caller remembers.
 */
@Service
public class OutletServiceImpl implements OutletService {

    /** BR-6: what a new branch's first till is given to number receipts with. */
    private static final long FIRST_BLOCK_SIZE = 10_000L;

    private final OutletRepository outlets;
    private final UserRepository users;
    private final TerminalRepository terminals;
    private final AuditService audit;

    public OutletServiceImpl(OutletRepository outlets, UserRepository users,
                             TerminalRepository terminals, AuditService audit) {
        this.terminals = terminals;
        this.outlets = outlets;
        this.users = users;
        this.audit = audit;
    }

    @Override
    @Transactional(readOnly = true)
    public List<OutletView> visibleTo(PosPrincipal caller, boolean mayViewAll, boolean includeInactive) {
        List<Outlet> found = mayViewAll
                ? outlets.findAllByOrderByNameAsc()
                : outlets.findAllByIdInOrderByNameAsc(assignedTo(caller));

        return found.stream()
                .filter(outlet -> includeInactive || outlet.isActive())
                .map(OutletView::of)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public OutletView get(UUID id, PosPrincipal caller, boolean mayViewAll) {
        Outlet outlet = outlets.findById(id).orElseThrow(() -> new OutletNotFoundException(id));

        // A branch the caller is not assigned to is refused, not hidden behind a
        // 404: they are authenticated, and FR-OUT-06 is about authority.
        if (!mayViewAll && !assignedTo(caller).contains(id)) {
            throw new OutletNotPermittedException(id);
        }
        return OutletView.of(outlet);
    }

    @Override
    @Transactional
    public OutletView create(OutletRequest request, PosPrincipal actor, String clientIp) {
        String code = request.code().toUpperCase();
        refuseDuplicateCode(code, null);

        Outlet outlet = new Outlet(code, request.name().trim());
        apply(request, outlet);
        Outlet saved = outlets.save(outlet);

        // BR-6: a branch with no till cannot number a receipt, and the first
        // attempt to sell there fails with NO_TERMINAL. V9 backfilled the
        // branches that existed then; a branch created from the settings screen
        // needs the same thing, or it opens unable to trade.
        Terminal firstTill = new Terminal(saved.getId(), "01", "Counter 1",
                terminals.highestAllocatedAt(saved.getId()) + 1, FIRST_BLOCK_SIZE);
        terminals.save(firstTill);

        audit.record(actor.userId(), "OUTLET_CREATED", "outlet", saved.getId(),
                null, snapshot(saved), actor.outletId(), null, clientIp);
        return OutletView.of(saved);
    }

    @Override
    @Transactional
    public OutletView update(UUID id, OutletRequest request, PosPrincipal actor, String clientIp) {
        Outlet outlet = outlets.findById(id).orElseThrow(() -> new OutletNotFoundException(id));
        Map<String, Object> before = snapshot(outlet);

        String code = request.code().toUpperCase();
        refuseDuplicateCode(code, id);

        outlet.setCode(code);
        outlet.setName(request.name().trim());
        apply(request, outlet);

        audit.record(actor.userId(), "OUTLET_UPDATED", "outlet", id,
                before, snapshot(outlet), actor.outletId(), null, clientIp);
        return OutletView.of(outlet);
    }

    @Override
    @Transactional
    public OutletView setActive(UUID id, boolean active, PosPrincipal actor, String clientIp) {
        Outlet outlet = outlets.findById(id).orElseThrow(() -> new OutletNotFoundException(id));
        Map<String, Object> before = snapshot(outlet);

        if (active) {
            outlet.activate();
        } else {
            outlet.deactivate();
        }

        audit.record(actor.userId(), active ? "OUTLET_REOPENED" : "OUTLET_DEACTIVATED", "outlet", id,
                before, snapshot(outlet), actor.outletId(), null, clientIp);
        return OutletView.of(outlet);
    }

    /**
     * The caller's assignments, read fresh.
     *
     * <p>Not taken from the principal: a session outlives a change to who works
     * where, and a stale assignment list is the one thing that would let an
     * outlet's records leak after access was withdrawn.
     */
    private Set<UUID> assignedTo(PosPrincipal caller) {
        return users.findById(caller.userId()).map(User::getOutletIds).orElse(Set.of());
    }

    private void refuseDuplicateCode(String code, UUID selfId) {
        boolean taken = selfId == null
                ? outlets.existsByCodeIgnoreCase(code)
                : outlets.existsByCodeIgnoreCaseAndIdNot(code, selfId);
        if (taken) {
            String usedBy = outlets.findByCodeIgnoreCase(code).map(Outlet::getName).orElse("another branch");
            throw new OutletCodeTakenException(code, usedBy);
        }
    }

    private void apply(OutletRequest request, Outlet outlet) {
        outlet.setTradingName(trimmed(request.tradingName()));
        outlet.setTown(trimmed(request.town()));
        outlet.setAddress(trimmed(request.address()));
        outlet.setPhone(trimmed(request.phone()));
        outlet.setManagerName(trimmed(request.managerName()));
        outlet.setReceiptFooter(trimmed(request.receiptFooter()));
        outlet.setLogoUrl(trimmed(request.logoUrl()));
        // FR-SET-02: absent means leave it alone, not set it to nothing — this
        // form is sent by screens that never show the field.
        if (request.defaultReorderLevel() != null) {
            outlet.setDefaultReorderLevel(request.defaultReorderLevel());
        }
    }

    private String trimmed(String value) {
        if (value == null) return null;
        String clean = value.trim();
        return clean.isEmpty() ? null : clean;
    }

    /**
     * BR-15 wants the before/after of a change, not a diff computed later.
     *
     * <p>Note which outlet id these entries carry: {@code outlet_id} is the
     * <em>scope the actor was working in</em>, and {@code entity_id} is the row
     * that changed. Passing the affected outlet as the scope looks natural and
     * is wrong twice over — an owner editing branch B while working at branch A
     * did it at A, and on a create the audit's REQUIRES_NEW transaction cannot
     * see a branch the outer transaction has not committed, so the foreign key
     * rejects the write and the whole request 500s after appearing to succeed.
     */
    private Map<String, Object> snapshot(Outlet outlet) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("code", outlet.getCode());
        state.put("name", outlet.getName());
        state.put("tradingName", outlet.getTradingName());
        state.put("town", outlet.getTown());
        state.put("address", outlet.getAddress());
        state.put("phone", outlet.getPhone());
        state.put("managerName", outlet.getManagerName());
        state.put("receiptFooter", outlet.getReceiptFooter());
        state.put("active", outlet.isActive());
        return state;
    }
}
