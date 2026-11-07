package gh.giftedlabs.pos;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	public PostgreSQLContainer postgresContainer() {
		// CI and release validation use PostgreSQL 18. Developers may point this
		// at an already-cached compatible image when working without registry access.
		String image = System.getProperty("test.postgres.image", "postgres:18");
		DockerImageName dockerImage = DockerImageName.parse(image)
				.asCompatibleSubstituteFor("postgres");
		return new PostgreSQLContainer(dockerImage);
	}

}
