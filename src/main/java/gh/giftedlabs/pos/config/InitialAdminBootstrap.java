package gh.giftedlabs.pos.config;

import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.entity.User;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.rules.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Creates the first owner only when an empty installation explicitly opts in. */
@Component
public class InitialAdminBootstrap implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(InitialAdminBootstrap.class);

    private final BootstrapProperties properties;
    private final UserRepository users;
    private final OutletRepository outlets;
    private final TerminalRepository terminals;
    private final PasswordEncoder passwords;
    private final PasswordEncoder pins;

    public InitialAdminBootstrap(BootstrapProperties properties, UserRepository users,
            OutletRepository outlets, TerminalRepository terminals,
            @Qualifier("passwordEncoder") PasswordEncoder passwords,
            @Qualifier("pinEncoder") PasswordEncoder pins) {
        this.terminals = terminals;
        this.properties = properties;
        this.users = users;
        this.outlets = outlets;
        this.passwords = passwords;
        this.pins = pins;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments arguments) {
        if (!properties.enabled() || users.count() > 0) return;
        if (properties.password().length() < 8) {
            throw new IllegalStateException("POS_BOOTSTRAP_ADMIN_PASSWORD must contain at least 8 characters");
        }
        if (!properties.pin().matches("\\d{4,6}")) {
            throw new IllegalStateException("POS_BOOTSTRAP_ADMIN_PIN must contain 4 to 6 digits");
        }

        Outlet outlet = outlets.findByCodeIgnoreCase(properties.outletCode())
                .orElseGet(() -> outlets.save(new Outlet(
                        properties.outletCode(), properties.outletName())));

        // BR-6: a till cannot number a receipt without a block, and a shop
        // cannot sell without a till. One is created with the first outlet so
        // the install is usable rather than usable-after-a-settings-trip.
        if (terminals.findByOutletIdAndCodeIgnoreCase(outlet.getId(), properties.terminalCode()).isEmpty()) {
            terminals.save(new Terminal(outlet.getId(), properties.terminalCode(),
                    properties.terminalName(), 1L, 10_000L));
        }

        User owner = new User(properties.username(), properties.fullName(),
                passwords.encode(properties.password()));
        if (!properties.email().isBlank()) owner.setEmail(properties.email());
        owner.setPinHash(pins.encode(properties.pin()));
        owner.assignRole(Role.OWNER);
        owner.assignOutlet(outlet.getId());
        users.save(owner);
        log.info("Created first-run owner account '{}' for outlet {}", owner.getUsername(), outlet.getCode());
    }
}
