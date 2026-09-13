package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** Catalogue — FR-PROD. */
public interface ProductRepository extends JpaRepository<Product, java.util.UUID> {

    @Query("select p from Product p where upper(p.sku) = upper(:sku)")
    Optional<Product> findBySku(@Param("sku") String sku);

    @Query("select count(p) > 0 from Product p where upper(p.sku) = upper(:sku) and (:selfId is null or p.id <> :selfId)")
    boolean skuTaken(@Param("sku") String sku, @Param("selfId") java.util.UUID selfId);

    @Query("select p from Product p join p.barcodes b where upper(b.code) = upper(:code)")
    Optional<Product> findByBarcode(@Param("code") String code);

    @Query("select count(b) > 0 from Product p join p.barcodes b "
            + "where upper(b.code) = upper(:code) and (:selfId is null or p.id <> :selfId)")
    boolean barcodeTaken(@Param("code") String code, @Param("selfId") java.util.UUID selfId);

    /**
     * FR-PROD-06 · NFR-1: name, SKU, barcode, brand and category, matched on
     * partial and out-of-order terms.
     *
     * <p>Each term must match <em>something</em>, but not the same field — "wire
     * 2.5 nexans" has to find a Nexans 2.5mm cable whose name carries neither
     * the brand nor, necessarily, the terms in that order. The caller passes one
     * term per parameter rather than a split inside SQL, so the trigram indexes
     * on name and sku are usable.
     */
    @Query("""
           select distinct p from Product p
             left join p.brand b
             left join p.category c
             left join p.barcodes bc
           where (:activeOnly = false or p.active = true)
             and (upper(p.name) like upper(concat('%', :term, '%'))
                  or upper(p.sku) like upper(concat('%', :term, '%'))
                  or upper(b.name) like upper(concat('%', :term, '%'))
                  or upper(c.name) like upper(concat('%', :term, '%'))
                  or upper(bc.code) like upper(concat('%', :term, '%')))
           """)
    Page<Product> searchOneTerm(@Param("term") String term,
                                @Param("activeOnly") boolean activeOnly,
                                Pageable pageable);

    Page<Product> findAllByActiveTrueOrderByNameAsc(Pageable pageable);

    Page<Product> findAllByOrderByNameAsc(Pageable pageable);

    /** FR-PROD-02: the running number behind an auto-generated SKU. */
    @Query("select count(p) from Product p where upper(p.sku) like upper(concat(:prefix, '%'))")
    long countWithSkuPrefix(@Param("prefix") String prefix);
}
