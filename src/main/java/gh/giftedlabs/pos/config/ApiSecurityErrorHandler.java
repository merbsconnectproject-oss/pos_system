package gh.giftedlabs.pos.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import gh.giftedlabs.pos.dto.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

/**
 * The filter-chain half of {@link gh.giftedlabs.pos.controller.ApiExceptionHandler}.
 *
 * <p>Security rejects a request before any controller runs, so
 * {@code @RestControllerAdvice} never sees it. Without this, Spring falls back
 * to {@code Http403ForbiddenEntryPoint} — the one entry point that applies when
 * no login mechanism is configured — and answers an unauthenticated caller with
 * a bodiless {@code 403}. Two things then go wrong:
 *
 * <ul>
 *   <li>The client cannot tell "you are not signed in" from "you are signed in
 *       but not allowed". Those need different screens: one is the sign-in
 *       form, the other is a permission notice.</li>
 *   <li>The body is empty, so the {@code ApiError} contract that every other
 *       failure honours is broken exactly where the client is least able to
 *       guess what happened.</li>
 * </ul>
 *
 * <p>Both are answered here in the same shape as everywhere else: {@code 401}
 * with {@code NOT_AUTHENTICATED} when there is no identity, {@code 403} with
 * {@code ACCESS_DENIED} when there is one but it lacks the authority.
 */
@Component
public class ApiSecurityErrorHandler implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper json;

    public ApiSecurityErrorHandler(ObjectMapper json) {
        this.json = json;
    }

    /** No credentials, or credentials the chain did not accept — FR-AUTH-01. */
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException failure) throws IOException {
        write(response, HttpServletResponse.SC_UNAUTHORIZED,
                new ApiError("NOT_AUTHENTICATED", "Sign in to continue", Map.of()));
    }

    /** A known user without the required permission — NFR-9. */
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException failure) throws IOException {
        write(response, HttpServletResponse.SC_FORBIDDEN,
                new ApiError("ACCESS_DENIED", "You do not have permission to do that", Map.of()));
    }

    private void write(HttpServletResponse response, int status, ApiError body) throws IOException {
        if (response.isCommitted()) return;
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), body);
    }
}
