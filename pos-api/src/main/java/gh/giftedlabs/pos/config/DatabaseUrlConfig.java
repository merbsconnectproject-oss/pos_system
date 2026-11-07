package gh.giftedlabs.pos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

/**
 * Translates Railway's {@code DATABASE_URL} into JDBC properties.
 *
 * <p>Railway (and Heroku, and Fly) inject a libpq-style URL:
 *
 * <pre>postgresql://user:password@host:5432/railway</pre>
 *
 * <p>The JDBC driver cannot parse that — it wants
 * {@code jdbc:postgresql://host:5432/railway} with the credentials supplied
 * separately. Without this, the first deploy fails with a driver error that
 * reads like a missing dependency, and the usual fix is to hand-copy the
 * host, user and password into three more Railway variables that then drift
 * whenever the database is rotated.
 *
 * <p>Runs as an {@link EnvironmentPostProcessor} rather than a
 * {@code @Configuration} class because the DataSource is built long before
 * beans are instantiated. Registered in {@code META-INF/spring.factories}.
 *
 * <p>An explicit {@code JDBC_DATABASE_URL} always wins, so a local developer
 * or a non-Railway host is never second-guessed.
 */
public class DatabaseUrlConfig implements EnvironmentPostProcessor {

    private static final Logger log = LoggerFactory.getLogger(DatabaseUrlConfig.class);

    private static final String SOURCE_NAME = "railway-database-url";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (environment.containsProperty("JDBC_DATABASE_URL")) {
            return;
        }

        String databaseUrl = environment.getProperty("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank() || databaseUrl.startsWith("jdbc:")) {
            return;
        }

        try {
            URI uri = URI.create(databaseUrl);
            String userInfo = uri.getUserInfo();

            Map<String, Object> resolved = new HashMap<>();
            resolved.put("spring.datasource.url", "jdbc:postgresql://%s%s%s".formatted(
                    uri.getHost(),
                    uri.getPort() > 0 ? ":" + uri.getPort() : "",
                    uri.getPath() == null ? "" : uri.getPath()));

            if (userInfo != null && !userInfo.isBlank()) {
                String[] parts = userInfo.split(":", 2);
                resolved.put("spring.datasource.username", parts[0]);
                if (parts.length > 1) {
                    resolved.put("spring.datasource.password", parts[1]);
                }
            }

            environment.getPropertySources()
                    .addFirst(new MapPropertySource(SOURCE_NAME, resolved));

            log.info("Resolved DATABASE_URL to JDBC for host {}", uri.getHost());

        } catch (RuntimeException ex) {
            // Do not guess. A malformed URL should fail at connection time with
            // a message about the URL, not be silently replaced by a default
            // that points somewhere unexpected.
            log.error("DATABASE_URL is set but could not be parsed; leaving datasource configuration untouched", ex);
        }
    }
}
