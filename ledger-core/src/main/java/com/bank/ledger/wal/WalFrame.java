package com.bank.ledger.wal;

import java.util.HexFormat;

/**
 * An immutable binary WAL frame representation.
 *
 * @param sequenceNum sequence number of the transaction (1-based)
 * @param prevHash    64-char hex string of previous hash
 * @param currentHash 64-char hex string of current transaction hash
 * @param payload     raw UTF-8/binary payload bytes
 * @param crc32       CRC-32 checksum of the frame
 */
public record WalFrame(
    long sequenceNum,
    String prevHash,
    String currentHash,
    byte[] payload,
    long crc32
) {
    public static final int MAGIC = 0x42414E4B; // ASCII "BANK"
}
