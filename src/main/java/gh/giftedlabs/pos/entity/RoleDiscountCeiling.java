package gh.giftedlabs.pos.entity;

import jakarta.persistence.*;

import java.math.BigDecimal;

/**
 * FR-POS-10: the largest discount a role may apply without an approver.
 *
 * <p>A percentage rather than an amount, because the same cedi off a bulb and
 * off a distribution board are not the same concession.
 */
@Entity
@Table(name = "role_discount_ceiling")
public class RoleDiscountCeiling {

    @Id
    @Column(name = "role", nullable = false)
    private String role;

    @Column(name = "max_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal maxPercent;

    protected RoleDiscountCeiling() { }

    public RoleDiscountCeiling(String role, BigDecimal maxPercent) {
        this.role = role;
        this.maxPercent = maxPercent;
    }

    public String getRole() { return role; }
    public BigDecimal getMaxPercent() { return maxPercent; }
    public void setMaxPercent(BigDecimal value) { this.maxPercent = value; }
}
