package gh.giftedlabs.pos.service.impl;

import gh.giftedlabs.pos.entity.Shift;
import gh.giftedlabs.pos.repository.ShiftRepository;
import gh.giftedlabs.pos.repository.TerminalRepository;
import gh.giftedlabs.pos.repository.UserRepository;
import gh.giftedlabs.pos.service.AuditService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@DisplayName("Automatic shift close at end of day")
class ShiftAutoCloseTest {

    @Test
    @DisplayName("an active shift closes without fabricating a physical cash count")
    void closesWithoutInventingCountedCash() {
        ShiftRepository shifts = mock(ShiftRepository.class);
        AuditService audit = mock(AuditService.class);
        Instant cutoff = Instant.parse("2026-09-18T23:00:00Z");
        Clock clock = Clock.fixed(cutoff, ZoneOffset.UTC);
        Shift active = new Shift(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                10_000L, Instant.parse("2026-09-18T08:00:00Z"));

        when(shifts.findByStatusAndOpenedAtLessThanEqualOrderByOpenedAtAsc(Shift.Status.OPEN, cutoff))
                .thenReturn(List.of(active));
        when(shifts.cashTakenDuring(active.getId())).thenReturn(25_000L);

        ShiftServiceImpl service = new ShiftServiceImpl(shifts, mock(TerminalRepository.class),
                mock(UserRepository.class), audit, clock);

        assertEquals(1, service.autoCloseDue(cutoff));
        assertFalse(active.isOpen());
        assertTrue(active.isAutomaticallyClosed());
        assertEquals(35_000L, active.getExpectedCash());
        assertNull(active.getCountedCash());
        assertNull(active.getVariance());
        assertNull(active.getClosedBy());
        assertEquals(cutoff, active.getClosedAt());
        assertTrue(active.getVarianceNote().contains("physical cash was not counted"));
        verify(audit).recordInCallerTransaction(isNull(), eq("SHIFT_AUTO_CLOSED"), eq("shift"),
                isNull(), isNull(), anyMap(), eq(active.getOutletId()), eq(active.getTerminalId()),
                eq("scheduler"));
    }

    @Test
    @DisplayName("no active shift means the timer makes no accounting entry")
    void doesNothingWhenNoShiftIsDue() {
        ShiftRepository shifts = mock(ShiftRepository.class);
        AuditService audit = mock(AuditService.class);
        Instant cutoff = Instant.parse("2026-09-18T23:00:00Z");
        when(shifts.findByStatusAndOpenedAtLessThanEqualOrderByOpenedAtAsc(Shift.Status.OPEN, cutoff))
                .thenReturn(List.of());

        ShiftServiceImpl service = new ShiftServiceImpl(shifts, mock(TerminalRepository.class),
                mock(UserRepository.class), audit, Clock.fixed(cutoff, ZoneOffset.UTC));

        assertEquals(0, service.autoCloseDue(cutoff));
        verifyNoInteractions(audit);
    }
}
