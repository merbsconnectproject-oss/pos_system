package gh.giftedlabs.pos.rules;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FR-CUST-03: the same person, however their number was written down.
 */
@DisplayName("Phone keys")
class PhoneKeyTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "0244123456",
            "+233244123456",
            "233244123456",
            "0244 123 456",
            "0244-123-456",
            "(024) 412 3456",
            "+233 24 412 3456",
    })
    @DisplayName("every spelling of one mobile number is one key")
    void oneNumberOneKey(String written) {
        assertEquals("244123456", PhoneKey.of(written),
                "'" + written + "' should be the same customer as 0244123456");
    }

    @Test
    @DisplayName("two different numbers are two keys")
    void differentNumbersDiffer() {
        assertNotEquals(PhoneKey.of("0244123456"), PhoneKey.of("0244123457"));
    }

    @Test
    @DisplayName("233 that is not a country code is left alone")
    void twoThreeThreeIsNotAlwaysACountryCode() {
        // Nine digits already: nothing to strip, even though it starts 233.
        assertEquals("233445566", PhoneKey.of("233445566"));
    }

    @Test
    @DisplayName("a landline keeps its digits rather than being padded")
    void shortNumbersSurvive() {
        assertEquals("3022345", PhoneKey.of("030 22 345".replace(" ", "").substring(1)));
    }

    @Test
    @DisplayName("nothing at all is no key, not an empty customer")
    void nothingIsNoKey() {
        assertEquals("", PhoneKey.of(null));
        assertEquals("", PhoneKey.of("   "));
        assertEquals("", PhoneKey.of("call the office"));
        assertFalse(PhoneKey.isUsable("12345"), "five digits is a typo, not a number");
        assertTrue(PhoneKey.isUsable("0244123456"));
    }
}
