package com.bank.ledger.api.dto;

import com.bank.ledger.domain.AccountType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/**
 * Request DTO for creating an account.
 */
public record CreateAccountRequest(
    @NotBlank(message = "Account number must not be blank")
    String accountNumber,

    @NotBlank(message = "Currency code must not be blank")
    @Pattern(regexp = "^[A-Za-z]{3}$", message = "Currency must be an ISO-4217 3-letter code")
    String currency,

    @NotNull(message = "Account type must be specified")
    AccountType type,

    boolean allowNegativeBalance
) {
}
