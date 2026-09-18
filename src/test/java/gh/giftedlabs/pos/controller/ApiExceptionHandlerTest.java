package gh.giftedlabs.pos.controller;

import gh.giftedlabs.pos.dto.ApiError;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

@DisplayName("HTTP error classification")
class ApiExceptionHandlerTest {

    @Test
    @DisplayName("a missing static asset is an ordinary 404, not an unhandled server error")
    void missingStaticAssetIsNotAServerError() {
        ApiExceptionHandler handler = new ApiExceptionHandler();

        ResponseEntity<ApiError> response = handler.onMissingResource(mock(NoResourceFoundException.class));

        assertEquals(404, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("NOT_FOUND", response.getBody().code());
    }
}
