package gh.giftedlabs.pos;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.DisplayName;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PosApiApplicationTests {

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void contextLoads() {
	}

	@Test
	@DisplayName("BR-15 · audit log rejects update and delete at the database boundary")
	void auditLogIsAppendOnly() {
		UUID id = jdbc.queryForObject("""
				insert into audit_log (action, entity_type) values ('TEST', 'test') returning id
				""", UUID.class);
		assertThrows(DataAccessException.class,
				() -> jdbc.update("update audit_log set action = 'ALTERED' where id = ?", id));
	}

}
