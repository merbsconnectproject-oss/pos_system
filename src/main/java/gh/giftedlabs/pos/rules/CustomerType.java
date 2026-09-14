package gh.giftedlabs.pos.rules;

import java.math.BigDecimal;

/**
 * FR-CUST-04: what kind of customer this is, and the price level it implies.
 *
 * <p>The mapping lives here rather than on the screen because it decides what
 * somebody is charged. A browser that decides the price level is a browser
 * that can change it.
 */
public enum CustomerType {

    /** Walk-in. Retail price, no standing discount. */
    RETAIL("retail", PriceLevel.RETAIL, "0"),

    ELECTRICIAN("electrician", PriceLevel.TRADE, "8"),
    CONTRACTOR("contractor", PriceLevel.TRADE, "10"),
    COMPANY("company", PriceLevel.TRADE, "12");

    /** Which of the product's prices applies — FR-PRICE-03. */
    public enum PriceLevel { RETAIL, TRADE }

    private final String key;
    private final PriceLevel priceLevel;
    private final BigDecimal defaultDiscountRate;

    CustomerType(String key, PriceLevel priceLevel, String defaultDiscountRate) {
        this.key = key;
        this.priceLevel = priceLevel;
        this.defaultDiscountRate = new BigDecimal(defaultDiscountRate);
    }

    public String key() { return key; }

    public PriceLevel priceLevel() { return priceLevel; }

    /**
     * What a customer of this kind starts on — FR-PRICE-05.
     *
     * <p>A starting point and not a rule: the deal a shop does with one
     * contractor is not the deal it does with every contractor, so the rate is
     * stored per customer and editable from here.
     */
    public BigDecimal defaultDiscountRate() { return defaultDiscountRate; }

    public static CustomerType fromKey(String key) {
        if (key != null) {
            for (CustomerType type : values()) {
                if (type.key.equalsIgnoreCase(key.trim())) return type;
            }
        }
        throw new IllegalArgumentException("Unknown customer type: " + key);
    }
}
