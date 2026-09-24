package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** FR-RCPT-02/08: the local operating-system queue used by this counter. */
@ConfigurationProperties(prefix = "pos.printer")
public record PrinterProperties(@DefaultValue("POS-80") String name) {
}
