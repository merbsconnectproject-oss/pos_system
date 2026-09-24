package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.PrintJobRequest;
import gh.giftedlabs.pos.dto.PrintJobView;
import gh.giftedlabs.pos.rules.Permission;
import gh.giftedlabs.pos.service.ReceiptPrinter;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The authenticated, same-origin boundary to the counter's local printer. */
@RestController
@RequestMapping("/api/printing")
public class PrintingController {

    private final ReceiptPrinter printer;

    public PrintingController(ReceiptPrinter printer) {
        this.printer = printer;
    }

    @PostMapping("/receipt")
    @PreAuthorize("hasAnyAuthority('" + Permission.Codes.POS_SELL + "', '"
            + Permission.Codes.SALE_REPRINT + "', '" + Permission.Codes.SALE_REFUND + "', '"
            + Permission.Codes.SETTINGS_TERMINAL + "')")
    public PrintJobView receipt(@Valid @RequestBody PrintJobRequest request) {
        String printerName = printer.print(request.receiptNumber(), request.payload());
        return new PrintJobView(true, printerName, request.receiptNumber());
    }
}
