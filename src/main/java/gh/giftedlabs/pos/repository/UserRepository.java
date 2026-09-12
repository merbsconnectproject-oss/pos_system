package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Users — FR-AUTH, FR-USER.
 *
 * <p>Services depend on this interface, never on an implementation. Swapping
 * the persistence mechanism, or standing a fake up in a unit test, touches
 * nothing above this line.
 */
public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * FR-AUTH-01: sign in with <em>either</em> a username or an email.
     *
     * <p>Deliberately does not filter on {@code is_active}. FR-AUTH-08 requires
     * a deactivated user to see a clear message, which means the service has to
     * tell "no such user" apart from "user is deactivated" — a repository that
     * hid inactive rows would collapse the two into the same answer.
     */
    @Query("""
            select u from User u
            where lower(u.username) = lower(:identifier)
               or lower(u.email) = lower(:identifier)
            """)
    Optional<User> findByUsernameOrEmail(@Param("identifier") String identifier);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);
}
