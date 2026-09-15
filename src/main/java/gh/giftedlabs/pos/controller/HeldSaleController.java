package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.HeldSaleRequest;
import gh.giftedlabs.pos.dto.HeldSaleView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.HeldSaleService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/held-sales")
public class HeldSaleController {
    private final HeldSaleService heldSales;

    public HeldSaleController(HeldSaleService heldSales) { this.heldSales = heldSales; }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public List<HeldSaleView> atOutlet(@RequestParam UUID outletId,
                                       @AuthenticationPrincipal PosPrincipal actor) {
        return heldSales.atOutlet(outletId, actor);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public HeldSaleView hold(@Valid @RequestBody HeldSaleRequest body,
                             @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return heldSales.hold(body, actor, clientIp(request));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('" + Permission.Codes.POS_SELL + "')")
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal PosPrincipal actor,
                       HttpServletRequest request) {
        heldSales.delete(id, actor, clientIp(request));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
