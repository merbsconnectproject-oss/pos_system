package gh.giftedlabs.pos.dto;

/** Confirmation that the local spooler accepted a receipt. */
public record PrintJobView(boolean ok, String printer, String receiptNumber) {
}
