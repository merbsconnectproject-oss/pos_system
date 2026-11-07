package gh.giftedlabs.pos.service;

import gh.giftedlabs.pos.dto.InstallmentPaymentRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanRequest;
import gh.giftedlabs.pos.dto.InstallmentPlanView;
import gh.giftedlabs.pos.dto.ReceiptView;
import gh.giftedlabs.pos.rules.ReceiptWidth;
import gh.giftedlabs.pos.security.PosPrincipal;

import java.util.UUID;

/** Customer installment plans — {@code customer.credit}. */
public interface InstallmentService {

    InstallmentPlanView.Page list(UUID outletId, UUID customerId);

    InstallmentPlanView get(UUID id);

    InstallmentPlanView create(InstallmentPlanRequest request, PosPrincipal actor, String clientIp);

    /** Applied to the oldest unpaid installment first. */
    InstallmentPlanView recordPayment(UUID id, InstallmentPaymentRequest request,
                                      PosPrincipal actor, String clientIp);

    /** The immutable receipt for one recorded collection. */
    ReceiptView paymentReceipt(UUID planId, UUID paymentId, ReceiptWidth width,
                               boolean reprint, PosPrincipal actor, String clientIp);

    /** Written off, or brought back. A decision, not a date arriving. */
    InstallmentPlanView setDefaulted(UUID id, boolean defaulted, String reason,
                                     PosPrincipal actor, String clientIp);
}
