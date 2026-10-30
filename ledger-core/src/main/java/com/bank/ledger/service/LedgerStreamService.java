package com.bank.ledger.service;

import com.bank.ledger.api.dto.AccountResponse;
import com.bank.ledger.api.dto.TransactionResponse;
import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.repository.AccountRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Real-time event streaming service broadcasting committed ledger transactions
 * and live balance modifications to connected clients over Server-Sent Events (SSE).
 */
@Service
public class LedgerStreamService {

    private static final Logger log = LoggerFactory.getLogger(LedgerStreamService.class);
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final AccountRepository accountRepository;

    public LedgerStreamService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    /**
     * Subscribes a new HTTP client to real-time ledger telemetry.
     */
    public SseEmitter subscribe() {
        // 0L means timeout is effectively disabled or handled by the server container
        SseEmitter emitter = new SseEmitter(0L);

        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        try {
            emitter.send(SseEmitter.event()
                .name("connected")
                .data(Map.of(
                    "status", "CONNECTED",
                    "channel", "ledger-telemetry",
                    "timestamp", Instant.now().toString()
                )));
        } catch (IOException e) {
            emitters.remove(emitter);
        }

        return emitter;
    }

    /**
     * Broadcasts a committed transaction and updated accounts to all active subscribers.
     */
    public void broadcast(LedgerTransaction tx, List<Account> affectedAccounts) {
        if (emitters.isEmpty()) {
            return;
        }

        Map<UUID, String> accountNumbers = Collections.emptyMap();
        Map<UUID, String> accountCurrencies = Collections.emptyMap();
        try {
            List<Account> all = accountRepository.findAll();
            accountNumbers = all.stream().collect(Collectors.toMap(Account::getId, Account::getAccountNumber, (a, b) -> a));
            accountCurrencies = all.stream().collect(Collectors.toMap(Account::getId, Account::getCurrency, (a, b) -> a));
        } catch (Exception e) {
            log.warn("Could not fetch account metadata for stream broadcast: {}", e.getMessage());
        }

        TransactionResponse txResponse = TransactionResponse.fromDomain(
            tx, 0L, "UNKNOWN", accountNumbers, accountCurrencies
        );

        List<AccountResponse> accountResponses = affectedAccounts.stream()
            .map(AccountResponse::fromDomain)
            .toList();

        List<SseEmitter> deadEmitters = new ArrayList<>();

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("transaction").data(txResponse));
                emitter.send(SseEmitter.event().name("balance_update").data(accountResponses));
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }

        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
        }
    }

    public int getActiveSubscriberCount() {
        return emitters.size();
    }
}
