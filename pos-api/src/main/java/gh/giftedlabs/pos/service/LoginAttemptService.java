package gh.giftedlabs.pos.service;

/**
 * Failed sign-in throttling — FR-AUTH-06, NFR-10.
 *
 * <p>An interface rather than a class because the storage question is not
 * settled. In-memory is correct for a local-first install, where one process
 * serves one counter. The consolidator, or any future multi-instance
 * deployment, needs a shared store — and that swap must not touch
 * {@link AuthenticationService}.
 *
 * <p>This also carries the PIN-approval path. A 4–6 digit PIN is low entropy
 * by construction: 10,000 to 1,000,000 possibilities. No hash function fixes
 * that. Throttling is the control that actually stops guessing, which is why
 * BR-10 approvals are counted here alongside sign-in.
 */
public interface LoginAttemptService {

    /** Outcome of asking whether an identifier may attempt again. */
    record Decision(boolean allowed, int attemptsRemaining, java.time.Duration retryAfter) {

        public static Decision allow(int attemptsRemaining) {
            return new Decision(true, attemptsRemaining, java.time.Duration.ZERO);
        }

        public static Decision block(java.time.Duration retryAfter) {
            return new Decision(false, 0, retryAfter);
        }
    }

    /**
     * Whether this identifier may attempt a sign-in now.
     *
     * <p>Called <em>before</em> credentials are checked, so a locked-out
     * identifier costs no hash verification — which is also what stops this
     * endpoint being used to burn CPU.
     */
    Decision check(String identifier);

    /** Record a failure. Returns the decision that now applies. */
    Decision recordFailure(String identifier);

    /** Clear the counter. Called on a successful sign-in, never otherwise. */
    void recordSuccess(String identifier);

    /** Administrative unlock — FR-AUTH-07. */
    void reset(String identifier);
}
