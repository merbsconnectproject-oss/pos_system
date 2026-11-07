package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.security.PosPrincipal;
import gh.giftedlabs.pos.service.ExportService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/**
 * FR-SET-08: the client's data, on request.
 *
 * <p>Behind {@code settings.general}. An export is every price, every cost,
 * every customer's phone number and every staff record in one file — the
 * single most sensitive thing this application can produce, and a permission
 * a cashier does not hold.
 *
 * <p>Streamed. The response is written as the tables are read rather than
 * assembled first, so a shop with years of sales exports without the counter
 * holding all of it in memory.
 */
@RestController
@RequestMapping("/api/export")
public class ExportController {

    private final ExportService exports;

    public ExportController(ExportService exports) {
        this.exports = exports;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('" + Permission.Codes.SETTINGS_GENERAL + "')")
    public ResponseEntity<StreamingResponseBody> export(
            @RequestParam(defaultValue = "JSON") String format,
            @AuthenticationPrincipal PosPrincipal actor,
            HttpServletRequest request) {

        ExportService.Format chosen = parse(format);
        String filename = exports.filenameFor(chosen);
        String clientIp = clientIp(request);

        StreamingResponseBody body = out -> exports.export(chosen, out, actor, clientIp);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"%s\"".formatted(filename))
                .contentType(chosen == ExportService.Format.JSON
                        ? MediaType.APPLICATION_JSON
                        : MediaType.parseMediaType("application/zip"))
                .body(body);
    }

    private ExportService.Format parse(String format) {
        try {
            return ExportService.Format.valueOf(format.trim().toUpperCase());
        } catch (IllegalArgumentException | NullPointerException unknown) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown export format: " + format);
        }
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
