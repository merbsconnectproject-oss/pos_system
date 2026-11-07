package gh.giftedlabs.pos.service.impl;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

@DisplayName("FR-AUTH-07 · Resend password-reset delivery")
class ResendPasswordResetNotifierTest {

    @Test
    void sendsResetLinkThroughResendApi() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var notifier = new ResendPasswordResetNotifier(
                builder, "re_test", "Radiance POS <no-reply@example.com>");

        server.expect(once(), requestTo("https://api.resend.com/emails"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer re_test"))
                .andExpect(header(HttpHeaders.USER_AGENT, "Radiance-POS/1.0"))
                .andExpect(header("Idempotency-Key", org.hamcrest.Matchers.startsWith("password-reset/")))
                .andExpect(jsonPath("$.to").value("ama@example.com"))
                .andExpect(jsonPath("$.text").value(org.hamcrest.Matchers.containsString("token=secret")))
                .andRespond(withSuccess("{\"id\":\"email-id\"}", MediaType.APPLICATION_JSON));

        notifier.send("ama@example.com", "Ama", "https://pos.example.com/reset-password?token=secret");

        server.verify();
    }

    @Test
    void failsClearlyWhenApiKeyIsMissing() {
        var notifier = new ResendPasswordResetNotifier(RestClient.builder(), "", "sender@example.com");
        assertThrows(IllegalStateException.class,
                () -> notifier.send("ama@example.com", "Ama", "https://example.com/reset"));
    }
}
