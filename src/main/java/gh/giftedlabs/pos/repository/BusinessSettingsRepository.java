package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.BusinessSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BusinessSettingsRepository extends JpaRepository<BusinessSettings, Short> {
}
