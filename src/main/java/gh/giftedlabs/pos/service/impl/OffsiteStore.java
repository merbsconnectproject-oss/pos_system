package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.config.PosProperties;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;

import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * NFR-6: getting the copy off this machine.
 *
 * <p>S3-compatible, which means Cloudflare R2 — what the delivery plan budgets
 * for — as well as Backblaze or AWS, through one client and one code path.
 *
 * <p>A class of its own so the backup service is about backing up rather than
 * about buckets, and so a test can replace it without a network.
 */
@Component
public class OffsiteStore {

    /**
     * Uploads and returns where it went.
     *
     * <p>The client is built per upload rather than held. This runs every
     * fifteen minutes at most, the credentials can change under it when
     * somebody edits the environment, and a connection pool for four requests
     * an hour is machinery nobody needs.
     */
    public String put(Path file, String name, PosProperties.Offsite config) {
        String key = config.prefix().isBlank() ? name : trimSlashes(config.prefix()) + "/" + name;

        try (S3Client s3 = client(config)) {
            s3.putObject(PutObjectRequest.builder()
                    .bucket(config.bucket())
                    .key(key)
                    .build(), file);
            // A successful PUT response only proves that the request was
            // accepted. HEAD is the acknowledgement boundary: do not mark a
            // backup off-site until the object is visible and non-empty.
            long expected;
            try {
                expected = java.nio.file.Files.size(file);
            } catch (java.io.IOException unreadable) {
                throw new IllegalStateException("cannot measure backup before verification", unreadable);
            }
            long stored = s3.headObject(HeadObjectRequest.builder()
                    .bucket(config.bucket()).key(key).build()).contentLength();
            if (stored != expected || stored == 0) {
                throw new IllegalStateException("off-site object size mismatch for " + key
                        + " (expected " + expected + ", got " + stored + ")");
            }
        }

        return "s3://" + config.bucket() + "/" + key;
    }

    /** Downloads an object for a controlled restore drill or operator recovery. */
    public void download(String name, Path target, PosProperties.Offsite config) {
        String key = config.prefix().isBlank() ? name : trimSlashes(config.prefix()) + "/" + name;
        try (S3Client s3 = client(config)) {
            s3.getObject(GetObjectRequest.builder().bucket(config.bucket()).key(key).build(),
                    ResponseTransformer.toFile(target));
        }
    }

    /**
     * Writes bytes straight to a key, without a file on the way.
     *
     * <p>The sync channels serialise to memory — a batch is kilobytes — and a
     * temporary file would only be somewhere for a half-written one to survive.
     */
    public String putBytes(byte[] body, String name, String contentType,
                           PosProperties.Offsite config) {
        String key = fullKey(name, config);
        try (S3Client s3 = client(config)) {
            s3.putObject(PutObjectRequest.builder()
                    .bucket(config.bucket())
                    .key(key)
                    .contentType(contentType)
                    .build(), RequestBody.fromBytes(body));
        }
        return "s3://" + config.bucket() + "/" + key;
    }

    /**
     * Reads one object into memory.
     *
     * <p>Empty when it is not there. An absent object is an answer, not a
     * failure: a shop asking for configuration nobody has published yet, or an
     * owner pulling before a shop has pushed, is ordinary on a first run.
     */
    public Optional<byte[]> get(String name, PosProperties.Offsite config) {
        try (S3Client s3 = client(config)) {
            return Optional.of(s3.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(config.bucket())
                    .key(fullKey(name, config))
                    .build()).asByteArray());
        } catch (NoSuchKeyException absent) {
            return Optional.empty();
        }
    }

    /**
     * Every key under a prefix, in lexical order.
     *
     * <p>Order is the point. Batches are named with a zero-padded sequence so
     * that lexical order *is* chronological order, and the owner applies them in
     * the order the shop wrote them — a batch applied out of order could
     * reference a customer created in one that has not arrived.
     */
    public List<String> list(String prefix, PosProperties.Offsite config) {
        List<String> keys = new ArrayList<>();
        String base = fullKey(prefix, config);

        try (S3Client s3 = client(config)) {
            String token = null;
            do {
                ListObjectsV2Response page = s3.listObjectsV2(ListObjectsV2Request.builder()
                        .bucket(config.bucket())
                        .prefix(base)
                        .continuationToken(token)
                        .build());
                page.contents().forEach(object -> keys.add(strip(object.key(), config)));
                // Paged rather than trusting one call: a shop back from a week
                // offline has more than a thousand batches waiting, and S3 caps
                // a listing at a thousand.
                token = Boolean.TRUE.equals(page.isTruncated()) ? page.nextContinuationToken() : null;
            } while (token != null);
        }

        Collections.sort(keys);
        return keys;
    }

    /** The configured prefix is deployment detail, never part of a caller's key. */
    private String fullKey(String name, PosProperties.Offsite config) {
        return config.prefix().isBlank() ? name : trimSlashes(config.prefix()) + "/" + name;
    }

    private String strip(String key, PosProperties.Offsite config) {
        String prefix = config.prefix().isBlank() ? "" : trimSlashes(config.prefix()) + "/";
        return key.startsWith(prefix) ? key.substring(prefix.length()) : key;
    }

    private S3Client client(PosProperties.Offsite config) {
        var builder = S3Client.builder()
                .httpClient(UrlConnectionHttpClient.create())
                .region(Region.of(config.region().isBlank() ? "auto" : config.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(config.accessKeyId(), config.secretAccessKey())));
        if (!config.endpoint().isBlank()) {
            builder = builder.endpointOverride(URI.create(config.endpoint())).forcePathStyle(true);
        }
        return builder.build();
    }

    private String trimSlashes(String value) {
        return value.replaceAll("^/+", "").replaceAll("/+$", "");
    }
}
