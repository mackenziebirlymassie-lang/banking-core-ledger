package com.bank.ledger.wal;

import com.bank.ledger.crypto.HashChainService;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;

import javax.sql.DataSource;
import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * High-assurance cryptographic audit scanner that traverses the database and WAL
 * to mathematically prove the integrity of the ledger and detect any unauthorized mutation.
 */
public class AuditVerifierService {

    /**
     * Verifies the database transactions table and linked postings against cryptographic hash rules.
     */
    public AuditVerificationReport verifyDatabase(DataSource dataSource, BinaryWalWriter walWriter) throws SQLException {
        Objects.requireNonNull(dataSource, "dataSource must not be null");

        String txQuery = """
            SELECT sequence_num, id, idempotency_key, payload_hash, description,
                   status, posted_at, prev_hash, hash
            FROM ledger_transactions
            ORDER BY sequence_num ASC
            """;

        String postingsQuery = """
            SELECT id, transaction_id, account_id, amount, direction, sequence_index
            FROM postings
            WHERE transaction_id = ?
            ORDER BY sequence_index ASC
            """;

        String expectedPrevHash = HashChainService.GENESIS_PREV_HASH;
        String rollingMerkleRoot = HashChainService.GENESIS_PREV_HASH;
        long scannedCount = 0;

        List<WalFrame> walFrames = null;
        if (walWriter != null) {
            try {
                walFrames = walWriter.readAllFrames();
            } catch (IOException e) {
                return AuditVerificationReport.failure(0, 0, null, "Failed to read WAL frames: " + e.getMessage());
            }
        }

        try (Connection conn = dataSource.getConnection();
             PreparedStatement txStmt = conn.prepareStatement(txQuery)) {

            try (ResultSet txRs = txStmt.executeQuery()) {
                while (txRs.next()) {
                    long seq = txRs.getLong("sequence_num");
                    UUID txId = UUID.fromString(txRs.getString("id"));
                    String idempotencyKey = txRs.getString("idempotency_key");
                    String storedPayloadHash = txRs.getString("payload_hash");
                    String statusStr = txRs.getString("status");
                    TransferStatus status = TransferStatus.valueOf(statusStr);
                    Timestamp postedAtTs = txRs.getTimestamp("posted_at");
                    Instant postedAt = postedAtTs.toInstant().truncatedTo(ChronoUnit.MILLIS);
                    String storedPrevHash = txRs.getString("prev_hash");
                    String storedHash = txRs.getString("hash");

                    scannedCount++;

                    // 1. Verify prev_hash link
                    if (!storedPrevHash.equalsIgnoreCase(expectedPrevHash)) {
                        return AuditVerificationReport.failure(
                            scannedCount, seq, txId,
                            String.format("Hash chain broken at sequence %d: expected prev_hash %s, but found %s",
                                seq, expectedPrevHash, storedPrevHash)
                        );
                    }

                    // 2. Fetch and verify double-entry balance of postings
                    List<Posting> postings = new ArrayList<>();
                    long totalDebits = 0L;
                    long totalCredits = 0L;

                    try (PreparedStatement postStmt = conn.prepareStatement(postingsQuery)) {
                        postStmt.setObject(1, txId);
                        try (ResultSet postRs = postStmt.executeQuery()) {
                            while (postRs.next()) {
                                UUID postId = UUID.fromString(postRs.getString("id"));
                                UUID accId = UUID.fromString(postRs.getString("account_id"));
                                long amount = postRs.getLong("amount");
                                Direction direction = Direction.valueOf(postRs.getString("direction"));
                                int seqIdx = postRs.getInt("sequence_index");

                                if (direction == Direction.DEBIT) {
                                    totalDebits += amount;
                                } else {
                                    totalCredits += amount;
                                }
                                postings.add(new Posting(postId, txId, accId, amount, direction, seqIdx));
                            }
                        }
                    }

                    if (postings.size() < 2) {
                        return AuditVerificationReport.failure(
                            scannedCount, seq, txId,
                            String.format("Transaction %s has fewer than 2 postings (%d)", txId, postings.size())
                        );
                    }

                    if (totalDebits != totalCredits) {
                        return AuditVerificationReport.failure(
                            scannedCount, seq, txId,
                            String.format("Unbalanced transaction %s: total debits (%d) != total credits (%d)",
                                txId, totalDebits, totalCredits)
                        );
                    }

                    // 3. Recompute payload hash from actual postings
                    String recomputedPayloadHash = HashChainService.computePayloadHash(postings);
                    if (!recomputedPayloadHash.equalsIgnoreCase(storedPayloadHash)) {
                        return AuditVerificationReport.failure(
                            scannedCount, seq, txId,
                            String.format("Payload tampering detected at sequence %d: stored payload_hash %s != recomputed %s",
                                seq, storedPayloadHash, recomputedPayloadHash)
                        );
                    }

                    // 4. Recompute transaction hash
                    String recomputedTxHash = HashChainService.computeTransactionHash(
                        storedPrevHash, txId, idempotencyKey, status, postedAt, recomputedPayloadHash
                    );

                    if (!recomputedTxHash.equalsIgnoreCase(storedHash)) {
                        return AuditVerificationReport.failure(
                            scannedCount, seq, txId,
                            String.format("Transaction hash mismatch at sequence %d (txId: %s): stored %s != recomputed %s",
                                seq, txId, storedHash, recomputedTxHash)
                        );
                    }

                    // 5. If WAL frames available, verify 1:1 parity with WAL
                    if (walFrames != null && walFrames.size() >= seq) {
                        WalFrame walFrame = walFrames.get((int) seq - 1);
                        if (!walFrame.currentHash().equalsIgnoreCase(storedHash)) {
                            return AuditVerificationReport.failure(
                                scannedCount, seq, txId,
                                String.format("WAL divergence at sequence %d: DB hash %s != WAL hash %s",
                                    seq, storedHash, walFrame.currentHash())
                            );
                        }
                    }

                    // Advance hash chain and rolling Merkle state
                    expectedPrevHash = storedHash;
                    rollingMerkleRoot = HashChainService.sha256Hex(rollingMerkleRoot + ":" + storedHash);
                }
            }
        }

        // Verify Merkle root matches WAL writer if active
        if (walWriter != null && scannedCount > 0) {
            String walMerkleRoot = walWriter.getMerkleRoot();
            if (!rollingMerkleRoot.equalsIgnoreCase(walMerkleRoot)) {
                return AuditVerificationReport.failure(
                    scannedCount, scannedCount, null,
                    String.format("Merkle root mismatch: DB computed %s != WAL %s", rollingMerkleRoot, walMerkleRoot)
                );
            }
        }

        return AuditVerificationReport.success(scannedCount, rollingMerkleRoot);
    }
}
