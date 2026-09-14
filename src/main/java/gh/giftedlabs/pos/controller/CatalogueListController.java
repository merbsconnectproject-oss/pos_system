package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.CatalogueListItem;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.CatalogueListService;
import gh.giftedlabs.pos.service.impl.CatalogueListServiceImpl.Kind;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Catalogue setup — FR-PROD-05, FR-UOM-01.
 *
 * <p>One route family for three lists. {@code /api/catalogue/categories},
 * {@code /brands} and {@code /units} behave identically, so they are one
 * controller with the list named in the path rather than three that would
 * drift apart.
 *
 * <p>Reading needs {@code stock.view} — a cashier's product form has to fill
 * its pickers. Changing the lists needs {@code product.edit}.
 */
@RestController
@RequestMapping("/api/catalogue/{list}")
public class CatalogueListController {

    private final CatalogueListService lists;

    public CatalogueListController(CatalogueListService lists) {
        this.lists = lists;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.STOCK_VIEW + "')")
    public List<CatalogueListItem> list(@PathVariable String list,
                                        @RequestParam(defaultValue = "false") boolean includeInactive) {
        return lists.list(kind(list), includeInactive);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_EDIT + "')")
    public CatalogueListItem add(@PathVariable String list, @Valid @RequestBody NameRequest body,
                                 @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return lists.add(kind(list), body.name(), actor, clientIp(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_EDIT + "')")
    public CatalogueListItem rename(@PathVariable String list, @PathVariable UUID id,
                                    @Valid @RequestBody NameRequest body,
                                    @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return lists.rename(kind(list), id, body.name(), actor, clientIp(request));
    }

    @PostMapping("/{id}/active")
    @PreAuthorize("hasAuthority('" + Permission.Codes.PRODUCT_EDIT + "')")
    public CatalogueListItem setActive(@PathVariable String list, @PathVariable UUID id,
                                       @RequestParam boolean value,
                                       @AuthenticationPrincipal PosPrincipal actor, HttpServletRequest request) {
        return lists.setActive(kind(list), id, value, actor, clientIp(request));
    }

    public record NameRequest(@NotBlank(message = "Enter a name") @Size(max = 120) String name) {
    }

    private Kind kind(String list) {
        return switch (list) {
            case "categories" -> Kind.CATEGORY;
            case "brands" -> Kind.BRAND;
            case "units" -> Kind.UNIT;
            default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such catalogue list");
        };
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded == null || forwarded.isBlank() ? request.getRemoteAddr() : forwarded.split(",")[0].trim();
    }
}
