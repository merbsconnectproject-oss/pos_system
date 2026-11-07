package gh.giftedlabs.pos.dto;

import java.util.UUID;

/**
 * Everything an outlet computer needs to join an existing business.
 *
 * <p>Written out as {@code <Outlet>-<CODE>.radiance-setup} on the owner's
 * computer and read by the installer on the counter. It exists because the
 * alternative is retyping: an outlet computer that is asked to invent its own
 * owner and its own outlet becomes a second business that happens to sell the
 * same products, and nothing afterwards can merge the two identities.
 *
 * <p>The counter needs six things to match before it can read a published
 * configuration — endpoint, bucket, region, prefix, outlet code and the sync
 * key — and five of them being right is indistinguishable from all of them
 * being wrong. So they travel together, as one file, rather than as six fields
 * on a form.
 *
 * <h2>This file is a credential</h2>
 *
 * <p>It carries the bucket's access key and the business's sync key in the
 * clear, because the installer has to use them before any database exists to
 * keep them in. Whoever holds it can read every outlet's configuration. It is
 * issued deliberately, one outlet at a time, audited as {@code
 * ENROLLMENT_ISSUED}, and meant to be deleted once the counter is enrolled.
 *
 * @param configVersion the {@link OutletConfig#VERSION} this owner publishes,
 *                      so an older installer can say "this business needs a
 *                      newer Radiance" instead of failing to parse a payload
 */
public record OutletEnrollment(
        int version,
        String issuedAt,
        Business business,
        Outlet outlet,
        CloudSync cloudSync,
        int configVersion) {

    /** The current shape. Bumped when a field changes meaning, not when one is added. */
    public static final int VERSION = 1;

    /**
     * Which business this is, for the installer to show before it commits.
     *
     * @param workspace the bucket prefix shared by every computer in the
     *                  business, or the bucket itself when no prefix is set.
     *                  Two businesses in one bucket are told apart by this, so
     *                  it is what makes "the same cloud account" unambiguous.
     */
    public record Business(String name, String workspace) {
    }

    /**
     * The outlet identity the counter must adopt rather than invent.
     *
     * <p>{@code id} is head office's UUID. The counter writes it into its own
     * database, which is what lets the owner later ask what the business sold
     * rather than what each machine sold under its own name for the same shop.
     */
    public record Outlet(UUID id, String code, String name) {
    }

    /** The bucket, and the two secrets needed to read it. */
    public record CloudSync(
            String endpoint,
            String bucket,
            String region,
            String prefix,
            String accessKeyId,
            String secretAccessKey,
            String encryptionKey) {
    }
}
