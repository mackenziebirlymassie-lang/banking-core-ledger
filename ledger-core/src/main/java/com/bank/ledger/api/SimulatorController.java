package com.bank.ledger.api;

import com.bank.ledger.api.dto.BurstSimulationRequest;
import com.bank.ledger.api.dto.BurstSimulationResponse;
import com.bank.ledger.domain.Account;
import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.PostgresLedgerEngine;
import com.bank.ledger.wal.BinaryWalWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * High-throughput Virtual Thread load generator for real-time stress testing and UI demonstration.
 */
@RestController
@RequestMapping("/api/v1/simulator")
public class SimulatorController {

    private static final Logger log = LoggerFactory.getLogger(SimulatorController.class);

    private final PostgresLedgerEngine engine;
    private final AccountRepository accountRepository;
    private final BinaryWalWriter walWriter;

    public SimulatorController(
        PostgresLedgerEngine engine,
        AccountRepository accountRepository,
        BinaryWalWriter walWriter
    ) {
        this.engine = engine;
        this.accountRepository = accountRepository;
        this.walWriter = walWriter;
    }

    @PostMapping("/burst")
    public ResponseEntity<BurstSimulationResponse> triggerBurst(
        @RequestBody(required = false) BurstSimulationRequest request
    ) throws Exception {
        BurstSimulationRequest req = request != null ? request : new BurstSimulationRequest(100, 20);
        int totalCount = req.effectiveCount();

        List<Account> accounts = accountRepository.findAll();
        Map<String, Account> accMap = accounts.stream()
            .collect(Collectors.toMap(Account::getAccountNumber, a -> a, (a, b) -> a));

        Account treasury = accMap.get("TREASURY-USD-001");
        Account alice = accMap.get("CUSTOMER-WALLET-ALICE");
        Account bob = accMap.get("CUSTOMER-WALLET-BOB");
        Account merchant = accMap.get("MERCHANT-SETTLEMENT-STRIPE");

        if (treasury == null || alice == null || bob == null) {
            return ResponseEntity.badRequest().body(new BurstSimulationResponse(
                0, 0, 0, 0L, 0.0, walWriter != null ? walWriter.getMerkleRoot() : "NONE",
                List.of("Required seeded accounts not found. Run seed initializer first.")
            ));
        }

        AtomicInteger successCount = new AtomicInteger();
        AtomicInteger failureCount = new AtomicInteger();
        ConcurrentLinkedQueue<String> errorMessages = new ConcurrentLinkedQueue<>();

        long startTime = System.currentTimeMillis();

        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<?>> futures = new ArrayList<>();

            for (int i = 0; i < totalCount; i++) {
                final int idx = i;
                futures.add(executor.submit(() -> {
                    String idempotencyKey = "burst-" + UUID.randomUUID();
                    try {
                        switch (idx % 4) {
                            case 0 -> engine.transfer(
                                idempotencyKey, "Simulated P2P Alice -> Bob " + idx,
                                alice.getId(), bob.getId(), 50L
                            );
                            case 1 -> engine.transfer(
                                idempotencyKey, "Simulated P2P Bob -> Alice " + idx,
                                bob.getId(), alice.getId(), 50L
                            );
                            case 2 -> engine.transfer(
                                idempotencyKey, "Simulated Merchant Payment Alice " + idx,
                                alice.getId(), merchant != null ? merchant.getId() : bob.getId(), 100L
                            );
                            default -> engine.transfer(
                                idempotencyKey, "Simulated Liquidity Top-Up " + idx,
                                treasury.getId(), alice.getId(), 200L
                            );
                        }
                        successCount.incrementAndGet();
                    } catch (Exception e) {
                        failureCount.incrementAndGet();
                        if (errorMessages.size() < 10) {
                            errorMessages.add("Tx " + idx + " failed: " + e.getMessage());
                        }
                    }
                }));
            }

            for (Future<?> f : futures) {
                f.get();
            }
        }

        long durationMs = Math.max(1L, System.currentTimeMillis() - startTime);
        double tps = (successCount.get() * 1000.0) / durationMs;
        String merkleRoot = walWriter != null ? walWriter.getMerkleRoot() : "IN_MEMORY";

        BurstSimulationResponse response = new BurstSimulationResponse(
            totalCount,
            successCount.get(),
            failureCount.get(),
            durationMs,
            Math.round(tps * 100.0) / 100.0,
            merkleRoot,
            new ArrayList<>(errorMessages)
        );

        return ResponseEntity.ok(response);
    }
}
