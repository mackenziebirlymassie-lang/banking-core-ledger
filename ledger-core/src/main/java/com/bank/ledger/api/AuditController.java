package com.bank.ledger.api;

import com.bank.ledger.api.dto.AuditResponse;
import com.bank.ledger.wal.AuditVerificationReport;
import com.bank.ledger.wal.AuditVerifierService;
import com.bank.ledger.wal.BinaryWalWriter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;

/**
 * REST controller for live cryptographic SHA-256 hash chain and WAL verification.
 */
@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final DataSource dataSource;
    private final BinaryWalWriter walWriter;
    private final AuditVerifierService verifierService;

    public AuditController(
        DataSource dataSource,
        BinaryWalWriter walWriter,
        AuditVerifierService verifierService
    ) {
        this.dataSource = dataSource;
        this.walWriter = walWriter;
        this.verifierService = verifierService;
    }

    @GetMapping("/verify")
    public ResponseEntity<AuditResponse> verifyChain() throws Exception {
        long start = System.currentTimeMillis();
        AuditVerificationReport report = verifierService.verifyDatabase(dataSource, walWriter);
        long durationMs = System.currentTimeMillis() - start;

        return ResponseEntity.ok(AuditResponse.fromReport(report, durationMs));
    }
}
