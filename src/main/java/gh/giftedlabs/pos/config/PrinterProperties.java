package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * FR-RCPT-02/08: the local operating-system queue used by this counter.
 *
 * <p>A hint, not a requirement, and blank by default. Shops install whatever
 * driver came with the printer and it names its own queue, so the printer is
 * detected rather than declared — see {@code ReceiptQueueMatcher}. Set this
 * only on a counter that has more than one thermal printer attached.
 */
@ConfigurationProperties(prefix = "pos.printer")
public record PrinterProperties(@DefaultValue("") String name) {
}
