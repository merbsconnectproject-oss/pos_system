package gh.giftedlabs.pos.rules;

/**
 * FR-CUST-03: the key a phone number is found and made unique by.
 *
 * <p>A shop writes the same number four ways — {@code 0244 123 456},
 * {@code +233244123456}, {@code 233244123456}, {@code 0244-123-456} — and all
 * four are one customer. Comparing what was typed would let the same person be
 * created four times and then quoted four different prices.
 *
 * <p>The key is the national significant number: the last nine digits, which
 * is what a Ghanaian mobile number is once the {@code 0} or the {@code +233}
 * in front of it is taken away. Shorter numbers keep all their digits rather
 * than being padded, so a landline is still findable.
 */
public final class PhoneKey {

    private PhoneKey() { }

    /** The national significant digits, or empty if there are none. */
    public static String of(String phone) {
        if (phone == null) return "";

        StringBuilder digits = new StringBuilder();
        for (char character : phone.toCharArray()) {
            if (Character.isDigit(character)) digits.append(character);
        }
        String plain = digits.toString();
        if (plain.isEmpty()) return "";

        // 233 in front is the country code, and only when what follows is the
        // right length — 233 is also a perfectly ordinary run of digits.
        if (plain.length() == 12 && plain.startsWith("233")) return plain.substring(3);

        return plain.length() > 9 ? plain.substring(plain.length() - 9) : plain;
    }

    /**
     * Is this enough of a number to be found by?
     *
     * <p>Nine digits is a Ghanaian mobile. Anything shorter is accepted as a
     * landline or an extension, but fewer than six is a typo, and a typo that
     * becomes a customer's unique key is one that cannot be corrected without
     * finding them first.
     */
    public static boolean isUsable(String phone) {
        return of(phone).length() >= 6;
    }
}
