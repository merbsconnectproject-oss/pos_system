package gh.giftedlabs.pos.architecture;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * NFR-4: a dropout must not interrupt trade.
 *
 * <p>The answer to this requirement is architectural rather than behavioural. The
 * counter does not ask the internet for permission to sell — the database is on
 * the same machine, and everything that leaves the building (the backup, the
 * transaction push) is a scheduled job that no sale waits for. A test that pulled
 * the network cable and timed a sale would measure that fact indirectly, slowly
 * and flakily.
 *
 * <p>So this reads the dependency graph instead. Starting at the class that
 * completes a sale, it follows every project import and asserts that nothing
 * reachable can talk to the outside world. It is not a measurement; it is the
 * reason no measurement is needed, and it fails the day somebody puts a remote
 * call in the selling path — which is the only way this requirement is actually
 * lost.
 */
@DisplayName("The counter sells without the network — NFR-4")
class CounterIndependenceTest {

    private static final Path SOURCES = Path.of("src/main/java");
    private static final String ROOT_PACKAGE = "gh.giftedlabs.pos";

    /** Anything that reaches beyond this machine. */
    private static final List<String> OFF_MACHINE = List.of(
            "OffsiteStore",
            "SyncService",
            "software.amazon.awssdk",
            "org.springframework.web.client.RestTemplate",
            "org.springframework.web.reactive.function.client.WebClient",
            "java.net.http.HttpClient");

    @Test
    @DisplayName("nothing on the path to completing a sale can reach off this machine")
    void theSellingPathIsLocal() throws IOException {
        Set<String> reached = closureFrom(ROOT_PACKAGE + ".service.impl.SaleServiceImpl");

        List<String> offending = new ArrayList<>();
        for (String type : reached) {
            String body = Files.readString(fileFor(type));
            for (String forbidden : OFF_MACHINE) {
                // Import lines only: a comment mentioning the sync channel is not
                // a dependency on it, and several of these classes explain why
                // they deliberately have none.
                if (body.lines().anyMatch(line ->
                        line.startsWith("import ") && line.contains(forbidden))) {
                    offending.add(type + " imports " + forbidden);
                }
            }
        }

        assertTrue(offending.isEmpty(),
                "the selling path reaches off this machine, so a dropout can now stop "
                        + "the till: " + offending);

        // A guard on the guard: if the walk stopped at the first class, the
        // assertion above would pass while proving nothing.
        assertTrue(reached.size() > 15,
                "the dependency walk only reached " + reached.size()
                        + " classes, which is too few to be the real selling path");
    }

    /** Every project class reachable by import from a starting point. */
    private Set<String> closureFrom(String start) throws IOException {
        Pattern imports = Pattern.compile("^import\\s+(?:static\\s+)?(" + Pattern.quote(ROOT_PACKAGE)
                + "\\.[A-Za-z0-9_.]+);", Pattern.MULTILINE);

        Set<String> seen = new HashSet<>();
        Deque<String> pending = new ArrayDeque<>();
        pending.add(start);

        while (!pending.isEmpty()) {
            String type = pending.poll();
            if (!seen.add(type)) continue;

            Path file = fileFor(type);
            if (!Files.exists(file)) {
                // A nested type or a static import of a constant: the file that
                // declares it is its outer class, which the walk reaches anyway.
                seen.remove(type);
                continue;
            }

            Matcher found = imports.matcher(Files.readString(file));
            while (found.find()) {
                String imported = found.group(1);
                if (!imported.endsWith("*")) pending.add(imported);
            }
        }
        return seen;
    }

    private Path fileFor(String type) {
        return SOURCES.resolve(type.replace('.', '/') + ".java");
    }
}
