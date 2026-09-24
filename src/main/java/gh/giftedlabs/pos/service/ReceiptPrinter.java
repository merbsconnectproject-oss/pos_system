package gh.giftedlabs.pos.service;

/** Sends a server-rendered ESC/POS job to the counter's configured printer. */
public interface ReceiptPrinter {

    String print(String receiptNumber, String base64Payload);
}
