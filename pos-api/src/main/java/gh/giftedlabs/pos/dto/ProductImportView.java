package gh.giftedlabs.pos.dto;

import java.util.List;

/** The committed result shown on D-16 — FR-PROD-10. */
public record ProductImportView(int created, int updated, List<ProductView> products) {
}
