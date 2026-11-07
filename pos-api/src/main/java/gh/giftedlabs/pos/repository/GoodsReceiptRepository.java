package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.GoodsReceipt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/** FR-SUP-02, FR-SUP-07. */
public interface GoodsReceiptRepository extends JpaRepository<GoodsReceipt, UUID> {

    List<GoodsReceipt> findAllBySupplierIdOrderByCreatedAtDesc(UUID supplierId);

    /** FR-SUP-07: receipts that contain a particular product. */
    List<GoodsReceipt> findDistinctByLinesProductIdOrderByCreatedAtDesc(UUID productId);

    List<GoodsReceipt> findAllByOutletIdOrderByCreatedAtDesc(UUID outletId);

    /** FR-SUP-06: a document is reversed at most once. */
    boolean existsByReversesId(UUID reversesId);

    /**
     * FR-SUP-07: what a supplier has delivered, in money.
     *
     * <p>Summed on demand rather than kept on the supplier row. A stored total
     * is a second record of what the receipts already say, and the two drift the
     * first time one is reversed. Reversals subtract themselves, because their
     * lines are counted with the sign their document carries.
     */
    @org.springframework.data.jpa.repository.Query("""
           select coalesce(sum(
                    case when r.reversesId is null then l.quantity * l.unitCost
                         else -(l.quantity * l.unitCost) end), 0)
             from GoodsReceipt r join r.lines l
            where r.supplierId = :supplierId and r.confirmedAt is not null
           """)
    java.math.BigDecimal totalSuppliedBy(
            @org.springframework.data.repository.query.Param("supplierId") UUID supplierId);
}
