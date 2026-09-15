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
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;

import java.net.URI;
import java.nio.file.Path;

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
