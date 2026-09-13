package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Optional first-run administrator. Disabled unless explicitly enabled. */
@ConfigurationProperties(prefix = "pos.bootstrap")
public record BootstrapProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("admin") String username,
        @DefaultValue("System Administrator") String fullName,
        @DefaultValue("") String email,
        @DefaultValue("") String password,
        @DefaultValue("") String pin,
        @DefaultValue("RAD") String outletCode,
        @DefaultValue("Radiance Lighting") String outletName,
        @DefaultValue("RAD") String receiptPrefix) {
}
