package com.bank.ledger.wal;

import com.bank.ledger.crypto.HashChainService;

import java.io.Closeable;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.zip.CRC32;

/**
 * Append-only binary Write-Ahead Log (WAL) writer using Java NIO FileChannel.
 * Guarantees zero-loss durability via channel.force(true) and tracks an in-memory Merkle state root.
 */
public class BinaryWalWriter implements Closeable {

    private final Path walPath;
    private final FileChannel channel;
    private final ReentrantLock writeLock = new ReentrantLock();
    private final AtomicReference<String> merkleRoot;

    public BinaryWalWriter(Path walPath) throws IOException {
        this.walPath = Objects.requireNonNull(walPath, "WAL path must not be null");
        this.channel = FileChannel.open(
            walPath,
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE,
            StandardOpenOption.READ
        );
        this.merkleRoot = new AtomicReference<>(HashChainService.GENESIS_PREV_HASH);

        // Replay existing frames on startup to resume state
        replayExistingFrames();
    }

    /**
     * Appends a new transaction frame to the WAL and synchronizes disk blocks.
     */
    public WalFrame append(long sequenceNum, String prevHash, String currentHash, byte[] payload) throws IOException {
        Objects.requireNonNull(prevHash, "prevHash must not be null");
        Objects.requireNonNull(currentHash, "currentHash must not be null");
        Objects.requireNonNull(payload, "payload must not be null");

        byte[] prevHashBytes = HexFormat.of().parseHex(prevHash);
        byte[] currentHashBytes = HexFormat.of().parseHex(currentHash);

        if (prevHashBytes.length != 32 || currentHashBytes.length != 32) {
            throw new IllegalArgumentException("Hash values must be 32 bytes (64 hex characters)");
        }

        int frameBodySize = 4 + 8 + 32 + 32 + 4 + payload.length; // Magic + Seq + Hashes + Len + Payload
        ByteBuffer buffer = ByteBuffer.allocate(frameBodySize + 4); // + 4 for CRC32

        buffer.putInt(WalFrame.MAGIC);
        buffer.putLong(sequenceNum);
        buffer.put(prevHashBytes);
        buffer.put(currentHashBytes);
        buffer.putInt(payload.length);
        buffer.put(payload);

        // Compute CRC-32 over everything preceding the CRC field
        CRC32 crc = new CRC32();
        crc.update(buffer.array(), 0, frameBodySize);
        long crcValue = crc.getValue();
        buffer.putInt((int) crcValue);

        buffer.flip();

        writeLock.lock();
        try {
            channel.position(channel.size());
            while (buffer.hasRemaining()) {
                channel.write(buffer);
            }
            channel.force(true); // Flush OS page cache to physical disk

            // Update rolling Merkle root: SHA-256(previousRoot + ":" + currentHash)
            String nextRoot = HashChainService.sha256Hex(merkleRoot.get() + ":" + currentHash);
            merkleRoot.set(nextRoot);

            return new WalFrame(sequenceNum, prevHash, currentHash, payload, crcValue);
        } finally {
            writeLock.unlock();
        }
    }

    public String getMerkleRoot() {
        return merkleRoot.get();
    }

    public Path getWalPath() {
        return walPath;
    }

    /**
     * Reads and validates all frames currently written to the WAL file.
     */
    public List<WalFrame> readAllFrames() throws IOException {
        writeLock.lock();
        try {
            List<WalFrame> frames = new ArrayList<>();
            ByteBuffer headerBuf = ByteBuffer.allocate(4 + 8 + 32 + 32 + 4); // Fixed header: 80 bytes
            long originalPos = channel.position();
            channel.position(0);

            while (channel.position() < channel.size()) {
                headerBuf.clear();
                int read = channel.read(headerBuf);
                if (read < headerBuf.capacity()) break;
                headerBuf.flip();

                int magic = headerBuf.getInt();
                if (magic != WalFrame.MAGIC) {
                    throw new IOException("Corrupted WAL frame: invalid magic byte header 0x" + Integer.toHexString(magic));
                }

                long seq = headerBuf.getLong();
                byte[] prevBytes = new byte[32];
                headerBuf.get(prevBytes);
                byte[] currBytes = new byte[32];
                headerBuf.get(currBytes);
                int payloadLen = headerBuf.getInt();

                ByteBuffer payloadAndCrc = ByteBuffer.allocate(payloadLen + 4);
                channel.read(payloadAndCrc);
                payloadAndCrc.flip();

                byte[] payload = new byte[payloadLen];
                payloadAndCrc.get(payload);
                long storedCrc = Integer.toUnsignedLong(payloadAndCrc.getInt());

                // Verify CRC32
                CRC32 crc = new CRC32();
                crc.update(headerBuf.array(), 0, headerBuf.capacity());
                crc.update(payload);
                if (crc.getValue() != storedCrc) {
                    throw new IOException("WAL CRC32 mismatch on sequence " + seq);
                }

                String prevHex = HexFormat.of().formatHex(prevBytes);
                String currHex = HexFormat.of().formatHex(currBytes);
                frames.add(new WalFrame(seq, prevHex, currHex, payload, storedCrc));
            }

            channel.position(originalPos);
            return frames;
        } finally {
            writeLock.unlock();
        }
    }

    private void replayExistingFrames() throws IOException {
        List<WalFrame> existing = readAllFrames();
        for (WalFrame frame : existing) {
            String nextRoot = HashChainService.sha256Hex(merkleRoot.get() + ":" + frame.currentHash());
            merkleRoot.set(nextRoot);
        }
    }

    @Override
    public void close() throws IOException {
        writeLock.lock();
        try {
            if (channel.isOpen()) {
                channel.force(true);
                channel.close();
            }
        } finally {
            writeLock.unlock();
        }
    }
}
