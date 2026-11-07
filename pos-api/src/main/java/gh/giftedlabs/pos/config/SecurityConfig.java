package gh.giftedlabs.pos.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Web security for both deployments — NFR-9, NFR-10.
 *
 * <p>One class, two chains, selected by what the environment actually is rather
 * than by which profile is named. Deploying to Railway and Cloudflare is then a
 * matter of setting variables, not editing code.
 *
 * <h2>Why sessions and not JWT</h2>
 *
 * <p>The three things that authenticate here are different principals over
 * different channels, and they do not share a mechanism:
 *
 * <ul>
 *   <li><b>Cashier → counter PC.</b> Same origin — the browser and this JVM are
 *       on the same machine, because the built frontend ships inside this JAR.
 *       An {@code HttpOnly} cookie cannot be read by JavaScript; a token in
 *       {@code localStorage} can be taken by any XSS. FR-AUTH-08 also needs
 *       immediate revocation: deactivate a user and the next request fails. A
 *       JWT stays valid until expiry unless a denylist is kept, which is
 *       server state — sessions, reimplemented.</li>
 *   <li><b>Shop → consolidator.</b> Machine to machine, outbound, no user. A
 *       per-outlet API key, checked by {@code ServiceKeyAuthFilter}.</li>
 *   <li><b>Owner → consolidator.</b> A person, on a different instance, with
 *       its own users. Session cookie again. If the consolidator is ever run
 *       scale-to-zero, back the session with the JDBC store rather than
 *       reaching for a token — the Postgres is already there.</li>
 * </ul>
 *
 * <p>None of the three couples to the others, so going online adds a filter and
 * changes no existing authentication.
 */
@Configuration
@EnableConfigurationProperties({PosProperties.class, BootstrapProperties.class, PrinterProperties.class})
@EnableMethodSecurity   // NFR-9: @PreAuthorize on every mutating endpoint
public class SecurityConfig {

    private final PosProperties properties;
    private final SessionGuardFilter sessionGuard;
    private final ApiSecurityErrorHandler securityErrors;

    public SecurityConfig(PosProperties properties, SessionGuardFilter sessionGuard,
                          ApiSecurityErrorHandler securityErrors) {
        this.properties = properties;
        this.sessionGuard = sessionGuard;
        this.securityErrors = securityErrors;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        boolean consolidator = properties.deployment().isConsolidator();

        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/sign-in").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/password-reset/request",
                                "/api/auth/password-reset/confirm").permitAll()
                        // Shops authenticate with a service key, not a session,
                        // so this path is opened here and guarded by its own filter.
                        .requestMatchers(HttpMethod.POST, "/api/ingest/**").permitAll()
                        // The built frontend, served from this JAR.
                        .requestMatchers(HttpMethod.GET, "/", "/index.html", "/assets/**", "/favicon.ico").permitAll()
                        .anyRequest().authenticated())

                .sessionManagement(session -> session
                        // FR-AUTH-04/05: a session outlives a locked screen. The
                        // POS locks rather than signing out, and that distinction
                        // is ScreenLockService's, not the container's.
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))

                // No form login and no basic auth: this is an API behind a
                // React app, and a browser credential prompt would be wrong.
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())

                // Rejections from the filter chain never reach
                // ApiExceptionHandler, so they are shaped here instead. Without
                // this, "not signed in" arrives as a bodiless 403 that the
                // client cannot distinguish from "not permitted".
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(securityErrors)
                        .accessDeniedHandler(securityErrors))

                // Defence-in-depth for both the embedded counter UI and the
                // separately hosted consolidator UI. These headers prevent
                // clickjacking, MIME sniffing, referrer leakage and browser
                // access to device capabilities. API responses are never
                // cacheable: sales, customer and stock data must not remain in
                // a shared browser/proxy cache after sign-out.
                .headers(headers -> headers
                        .frameOptions(frame -> frame.deny())
                        .contentTypeOptions(content -> { })
                        .referrerPolicy(referrer -> referrer.policy(
                                ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .permissionsPolicy(policy -> policy.policy(
                                "camera=(), microphone=(), geolocation=(), payment=()")))

                .csrf(csrf -> csrf
                        // Cookie-based sessions need CSRF protection. The token
                        // is readable by the frontend so it can echo it back.
                        .csrfTokenRepository(csrfRepository(consolidator))
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        // Ingest is authenticated by a key in a header, never by
                        // an ambient cookie, so CSRF does not apply to it.
                        .ignoringRequestMatchers("/api/ingest/**"));

        http.addFilterBefore(sessionGuard, AuthorizationFilter.class);

        if (consolidator) {
            http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
        } else {
            // A counter PC is strictly same-origin. Nothing off-machine reaches it.
            http.cors(cors -> cors.disable());
        }

        return http.build();
    }

    private CookieCsrfTokenRepository csrfRepository(boolean consolidator) {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie
                .secure(consolidator)
                .httpOnly(false)
                .sameSite(consolidator ? "Lax" : "Strict")
                .path("/"));
        return repository;
    }

    /**
     * Cloudflare Pages calling the Railway API.
     *
     * <p>Only used by the consolidator. Prefer putting the frontend and API
     * under one registrable domain — {@code app.example.com} and
     * {@code api.example.com} — because then the session cookie is first-party,
     * {@code SameSite=lax} holds, and none of this is load-bearing.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        List<String> origins = properties.web().allowedOrigins();

        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(origins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "X-Outlet-Key"));
        // Required for the session cookie to travel cross-origin at all.
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }
}
