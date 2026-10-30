package com.bank.ledger.api;

import com.bank.ledger.service.LedgerStreamService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Server-Sent Events (SSE) telemetry endpoint for streaming live double-entry transfers and balance updates.
 */
@RestController
@RequestMapping("/api/v1/stream")
public class StreamController {

    private final LedgerStreamService streamService;

    public StreamController(LedgerStreamService streamService) {
        this.streamService = streamService;
    }

    @GetMapping(value = "/transactions", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamTransactions() {
        return streamService.subscribe();
    }
}
