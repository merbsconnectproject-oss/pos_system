package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Optional first-run administrator. Disabled unless explicitly enabled. */
@ConfigurationProperties(prefix = "pos.bootstrap")
public record BootstrapProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("admin@radiancepos.com") String username,
        @DefaultValue("Mr Jones") String fullName,
        @DefaultValue("") String email,
        @DefaultValue("") String password,
        @DefaultValue("") String pin,
        @DefaultValue("RAD") String outletCode,
        @DefaultValue("Radiance Lighting") String outletName,
        @DefaultValue("01") String terminalCode,
        @DefaultValue("Counter 1") String terminalName) {
}
