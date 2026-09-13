package gh.giftedlabs.pos.repository;

import gh.giftedlabs.pos.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {}
