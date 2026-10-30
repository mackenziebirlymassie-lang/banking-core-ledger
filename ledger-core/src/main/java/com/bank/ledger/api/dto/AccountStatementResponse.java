package com.bank.ledger.api.dto;

import java.util.List;

/**
 * Paginated Account Statement response DTO with full running balance history.
 */
public record AccountStatementResponse(
    AccountResponse account,
    List<StatementPostingResponse> postings,
    long totalEntries,
    int page,
    int pageSize
) {
}
