package com.bank.ledger.api;

import com.bank.ledger.exception.AccountNotFoundException;
import com.bank.ledger.exception.CurrencyMismatchException;
import com.bank.ledger.exception.IdempotencyConflictException;
import com.bank.ledger.exception.InsufficientFundsException;
import com.bank.ledger.exception.LedgerException;
import com.bank.ledger.exception.UnbalancedTransactionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Global REST exception handler producing standard RFC 7807 ProblemDetail error payloads.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(InsufficientFundsException.class)
    public ProblemDetail handleInsufficientFunds(InsufficientFundsException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        problem.setTitle("Insufficient Funds");
        problem.setType(URI.create("urn:problem:insufficient-funds"));
        problem.setProperty("errorCode", "INSUFFICIENT_FUNDS");
        problem.setProperty("accountId", ex.getAccountId());
        problem.setProperty("attemptedAmountMinor", ex.getAttemptedAmount());
        problem.setProperty("availableBalanceMinor", ex.getAvailableBalance());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(UnbalancedTransactionException.class)
    public ProblemDetail handleUnbalanced(UnbalancedTransactionException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        problem.setTitle("Unbalanced Double-Entry Postings");
        problem.setType(URI.create("urn:problem:unbalanced-postings"));
        problem.setProperty("errorCode", "UNBALANCED_POSTINGS");
        problem.setProperty("totalDebitsMinor", ex.getTotalDebits());
        problem.setProperty("totalCreditsMinor", ex.getTotalCredits());
        problem.setProperty("discrepancyMinor", Math.abs(ex.getTotalDebits() - ex.getTotalCredits()));
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(CurrencyMismatchException.class)
    public ProblemDetail handleCurrencyMismatch(CurrencyMismatchException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
        problem.setTitle("Currency Mismatch");
        problem.setType(URI.create("urn:problem:currency-mismatch"));
        problem.setProperty("errorCode", "CURRENCY_MISMATCH");
        problem.setProperty("expectedCurrency", ex.getExpectedCurrency());
        problem.setProperty("actualCurrency", ex.getActualCurrency());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(IdempotencyConflictException.class)
    public ProblemDetail handleIdempotencyConflict(IdempotencyConflictException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
        problem.setTitle("Idempotency Conflict");
        problem.setType(URI.create("urn:problem:idempotency-conflict"));
        problem.setProperty("errorCode", "IDEMPOTENCY_CONFLICT");
        problem.setProperty("idempotencyKey", ex.getIdempotencyKey());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(AccountNotFoundException.class)
    public ProblemDetail handleAccountNotFound(AccountNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Account Not Found");
        problem.setType(URI.create("urn:problem:account-not-found"));
        problem.setProperty("errorCode", "ACCOUNT_NOT_FOUND");
        problem.setProperty("accountId", ex.getAccountId());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(LedgerException.class)
    public ProblemDetail handleLedgerException(LedgerException ex) {
        HttpStatus status = HttpStatus.UNPROCESSABLE_ENTITY;
        String errorCode = "LEDGER_ERROR";

        if (ex.getMessage() != null && ex.getMessage().contains("Optimistic lock")) {
            status = HttpStatus.CONFLICT;
            errorCode = "OPTIMISTIC_LOCK_FAILURE";
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, ex.getMessage());
        problem.setTitle("Ledger Processing Error");
        problem.setType(URI.create("urn:problem:ledger-error"));
        problem.setProperty("errorCode", errorCode);
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ProblemDetail handleMissingHeader(MissingRequestHeaderException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.BAD_REQUEST,
            String.format("Required header '%s' is missing", ex.getHeaderName())
        );
        problem.setTitle("Missing Required Header");
        problem.setType(URI.create("urn:problem:missing-header"));
        problem.setProperty("errorCode", "MISSING_IDEMPOTENCY_KEY");
        problem.setProperty("headerName", ex.getHeaderName());
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidationException(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }

        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed on request body");
        problem.setTitle("Validation Failure");
        problem.setType(URI.create("urn:problem:validation-error"));
        problem.setProperty("errorCode", "INVALID_REQUEST");
        problem.setProperty("fieldErrors", errors);
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleGenericException(Exception ex) {
        log.error("Unhandled internal server exception", ex);
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(
            HttpStatus.INTERNAL_SERVER_ERROR,
            ex.getMessage() != null ? ex.getMessage() : "An unexpected server error occurred."
        );
        problem.setTitle("Internal Server Error");
        problem.setType(URI.create("urn:problem:internal-server-error"));
        problem.setProperty("errorCode", "INTERNAL_SERVER_ERROR");
        problem.setProperty("timestamp", Instant.now().toString());
        return problem;
    }
}
