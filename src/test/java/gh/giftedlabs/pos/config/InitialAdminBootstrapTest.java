package gh.giftedlabs.pos.config;

import gh.giftedlabs.pos.entity.Outlet;
import gh.giftedlabs.pos.entity.Terminal;
import gh.giftedlabs.pos.repository.OutletRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.ApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("Windows first-run bootstrap")
class InitialAdminBootstrapTest {

    @Mock UserRepository users;
    @Mock OutletRepository outlets;
    @Mock TerminalRepository terminals;
    @Mock PasswordEncoder passwords;
    @Mock PasswordEncoder pins;
    @Mock ApplicationArguments arguments;

    @Test
    @DisplayName("FR-RCPT-03 · configured terminal code becomes the first receipt terminal")
    void createsTheConfiguredTerminal() {
        BootstrapProperties properties = new BootstrapProperties(
                true, "owner", "Shop Owner", "owner@example.com", "password1", "2468",
                "INC", "Inco Hardware", "K02", "Front Counter");
        when(users.count()).thenReturn(0L);
        when(outlets.findByCodeIgnoreCase("INC")).thenReturn(Optional.empty());
        when(outlets.save(any(Outlet.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(terminals.findByOutletIdAndCodeIgnoreCase(null, "K02")).thenReturn(Optional.empty());
        when(passwords.encode("password1")).thenReturn("password-hash");
        when(pins.encode("2468")).thenReturn("pin-hash");

        new InitialAdminBootstrap(properties, users, outlets, terminals, passwords, pins).run(arguments);

        ArgumentCaptor<Terminal> terminal = ArgumentCaptor.forClass(Terminal.class);
        verify(terminals).save(terminal.capture());
        assertThat(terminal.getValue().getCode()).isEqualTo("K02");
        assertThat(terminal.getValue().getName()).isEqualTo("Front Counter");
    }
}
