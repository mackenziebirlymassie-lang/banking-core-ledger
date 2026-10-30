package com.bank.ledger.api;

import com.bank.ledger.api.dto.BurstSimulationRequest;
import com.bank.ledger.api.dto.CreateAccountRequest;
import com.bank.ledger.api.dto.CreateHoldRequest;
import com.bank.ledger.api.dto.CreateTransferRequest;
import com.bank.ledger.api.dto.PostingLegRequest;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class LedgerApiIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @Order(1)
    @DisplayName("Startup & Seeding: Ledger boots cleanly with 7 seeded accounts and valid cryptographic hash chain")
    void shouldBootWithSeededAccountsAndValidChain() throws Exception {
        // Verify accounts seeded
        mockMvc.perform(get("/api/v1/accounts"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(7))
            .andExpect(jsonPath("$[?(@.accountNumber == 'TREASURY-USD-001')].allowNegativeBalance").value(true))
            .andExpect(jsonPath("$[?(@.accountNumber == 'CUSTOMER-WALLET-ALICE')].type").value("LIABILITY"));

        // Verify cryptographic hash chain on seeded transactions
        mockMvc.perform(get("/api/v1/audit/verify"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.valid").value(true))
            .andExpect(jsonPath("$.totalTransactionsScanned").value(22))
            .andExpect(jsonPath("$.merkleRoot").isNotEmpty());
    }

    @Test
    @Order(2)
    @DisplayName("Accounts: Create new account with formatted monetary attributes")
    void shouldCreateNewAccount() throws Exception {
        CreateAccountRequest request = new CreateAccountRequest(
            "MERCHANT-AMAZON-PAY",
            "USD",
            AccountType.LIABILITY,
            false
        );

        mockMvc.perform(post("/api/v1/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.accountNumber").value("MERCHANT-AMAZON-PAY"))
            .andExpect(jsonPath("$.availableBalanceMinor").value(0))
            .andExpect(jsonPath("$.availableBalanceFormatted").value("$0.00"))
            .andExpect(jsonPath("$.normalBalanceDirection").value("CREDIT"));
    }

    @Test
    @Order(3)
    @DisplayName("Statements: Generates chronological account statement with running balances")
    void shouldGenerateAccountStatement() throws Exception {
        // Find Alice's account ID
        MvcResult accsResult = mockMvc.perform(get("/api/v1/accounts"))
            .andExpect(status().isOk())
            .andReturn();

        JsonNode accountsJson = objectMapper.readTree(accsResult.getResponse().getContentAsString());
        String aliceId = null;
        for (JsonNode acc : accountsJson) {
            if ("CUSTOMER-WALLET-ALICE".equals(acc.get("accountNumber").asText())) {
                aliceId = acc.get("id").asText();
                break;
            }
        }
        assertThat(aliceId).isNotNull();

        // Get statement
        mockMvc.perform(get("/api/v1/accounts/{id}/statement", aliceId)
                .param("page", "1")
                .param("pageSize", "20"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.account.accountNumber").value("CUSTOMER-WALLET-ALICE"))
            .andExpect(jsonPath("$.postings").isArray())
            .andExpect(jsonPath("$.postings[0].runningBalanceFormatted").isNotEmpty());
    }

    @Test
    @Order(4)
    @DisplayName("Transfers: Idempotency-Key header enforcement (201 Created -> 200 OK replay -> 409 Conflict)")
    void shouldEnforceIdempotencyHeaderAndStatusLifecycle() throws Exception {
        MvcResult accsResult = mockMvc.perform(get("/api/v1/accounts")).andReturn();
        JsonNode accountsJson = objectMapper.readTree(accsResult.getResponse().getContentAsString());

        UUID aliceId = null;
        UUID bobId = null;
        for (JsonNode acc : accountsJson) {
            if ("CUSTOMER-WALLET-ALICE".equals(acc.get("accountNumber").asText())) {
                aliceId = UUID.fromString(acc.get("id").asText());
            } else if ("CUSTOMER-WALLET-BOB".equals(acc.get("accountNumber").asText())) {
                bobId = UUID.fromString(acc.get("id").asText());
            }
        }
        assertThat(aliceId).isNotNull();
        assertThat(bobId).isNotNull();

        String idempotencyKey = "api-tx-test-" + UUID.randomUUID();
        CreateTransferRequest transferReq = new CreateTransferRequest(
            "P2P payment for lunch",
            aliceId,
            bobId,
            1500L, // $15.00
            null
        );

        // 1. Missing header -> 400 Bad Request
        mockMvc.perform(post("/api/v1/transfers")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferReq)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.errorCode").value("MISSING_IDEMPOTENCY_KEY"));

        // 2. Fresh transfer with Idempotency-Key -> 201 Created
        mockMvc.perform(post("/api/v1/transfers")
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferReq)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.idempotencyKey").value(idempotencyKey))
            .andExpect(jsonPath("$.description").value("P2P payment for lunch"))
            .andExpect(jsonPath("$.postings.length()").value(2))
            .andExpect(jsonPath("$.postings[0].amountFormatted").value("$15.00"));

        // 3. Idempotent Replay with exact same key & body -> 200 OK
        mockMvc.perform(post("/api/v1/transfers")
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(transferReq)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.idempotencyKey").value(idempotencyKey));

        // 4. Same key with altered description -> 409 Conflict
        CreateTransferRequest conflictingReq = new CreateTransferRequest(
            "Fraudulent altered description",
            aliceId,
            bobId,
            1500L,
            null
        );
        mockMvc.perform(post("/api/v1/transfers")
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(conflictingReq)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.errorCode").value("IDEMPOTENCY_CONFLICT"));
    }

    @Test
    @Order(5)
    @DisplayName("Invariants: Rejects overdraft with 422 Unprocessable Entity (INSUFFICIENT_FUNDS)")
    void shouldRejectOverdraftWithProblemDetail() throws Exception {
        MvcResult accsResult = mockMvc.perform(get("/api/v1/accounts")).andReturn();
        JsonNode accountsJson = objectMapper.readTree(accsResult.getResponse().getContentAsString());

        UUID aliceId = null;
        UUID bobId = null;
        for (JsonNode acc : accountsJson) {
            if ("CUSTOMER-WALLET-ALICE".equals(acc.get("accountNumber").asText())) {
                aliceId = UUID.fromString(acc.get("id").asText());
            } else if ("CUSTOMER-WALLET-BOB".equals(acc.get("accountNumber").asText())) {
                bobId = UUID.fromString(acc.get("id").asText());
            }
        }

        CreateTransferRequest overdraftReq = new CreateTransferRequest(
            "Excessive transfer attempt",
            aliceId,
            bobId,
            999_999_999L, // $9,999,999.99
            null
        );

        mockMvc.perform(post("/api/v1/transfers")
                .header("Idempotency-Key", "overdraft-" + UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(overdraftReq)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.errorCode").value("INSUFFICIENT_FUNDS"))
            .andExpect(jsonPath("$.attemptedAmountMinor").value(999_999_999L));
    }

    @Test
    @Order(6)
    @DisplayName("Invariants: Rejects unbalanced multi-leg transfer with 422 (UNBALANCED_POSTINGS)")
    void shouldRejectUnbalancedPostings() throws Exception {
        MvcResult accsResult = mockMvc.perform(get("/api/v1/accounts")).andReturn();
        JsonNode accountsJson = objectMapper.readTree(accsResult.getResponse().getContentAsString());

        UUID aliceId = UUID.fromString(accountsJson.get(0).get("id").asText());
        UUID bobId = UUID.fromString(accountsJson.get(1).get("id").asText());

        CreateTransferRequest unbalancedReq = new CreateTransferRequest(
            "Broken transaction",
            null, null, null,
            List.of(
                new PostingLegRequest(aliceId, 1000L, Direction.DEBIT),
                new PostingLegRequest(bobId, 900L, Direction.CREDIT) // 100 discrepancy
            )
        );

        mockMvc.perform(post("/api/v1/transfers")
                .header("Idempotency-Key", "unbalanced-" + UUID.randomUUID())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(unbalancedReq)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.errorCode").value("UNBALANCED_POSTINGS"))
            .andExpect(jsonPath("$.discrepancyMinor").value(100));
    }

    @Test
    @Order(7)
    @DisplayName("Two-Phase Hold Lifecycle: Hold -> Settle and Hold -> Void")
    void shouldExecuteTwoPhaseHoldLifecycle() throws Exception {
        MvcResult accsResult = mockMvc.perform(get("/api/v1/accounts")).andReturn();
        JsonNode accountsJson = objectMapper.readTree(accsResult.getResponse().getContentAsString());

        UUID aliceId = null;
        UUID escrowId = null;
        for (JsonNode acc : accountsJson) {
            if ("CUSTOMER-WALLET-ALICE".equals(acc.get("accountNumber").asText())) {
                aliceId = UUID.fromString(acc.get("id").asText());
            } else if ("CARD-HOLD-ESCROW-USD".equals(acc.get("accountNumber").asText())) {
                escrowId = UUID.fromString(acc.get("id").asText());
            }
        }

        // 1. Authorize Hold ($35.00)
        CreateHoldRequest holdReq = new CreateHoldRequest(
            "Starbucks Pre-Auth",
            aliceId,
            escrowId,
            3500L
        );

        String holdKey = "hold-" + UUID.randomUUID();
        MvcResult holdRes = mockMvc.perform(post("/api/v1/transfers/hold")
                .header("Idempotency-Key", holdKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(holdReq)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andReturn();

        String holdId = objectMapper.readTree(holdRes.getResponse().getContentAsString()).get("id").asText();

        // 2. Settle Hold
        mockMvc.perform(post("/api/v1/transfers/{id}/settle", holdId)
                .header("Idempotency-Key", "settle-" + holdId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("POSTED"));

        // Settle replay is idempotent
        mockMvc.perform(post("/api/v1/transfers/{id}/settle", holdId)
                .header("Idempotency-Key", "settle-replay-" + holdId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("POSTED"));

        // 3. Authorize Hold 2 and Void
        String hold2Key = "hold2-" + UUID.randomUUID();
        MvcResult hold2Res = mockMvc.perform(post("/api/v1/transfers/hold")
                .header("Idempotency-Key", hold2Key)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(holdReq)))
            .andExpect(status().isCreated())
            .andReturn();

        String hold2Id = objectMapper.readTree(hold2Res.getResponse().getContentAsString()).get("id").asText();

        mockMvc.perform(post("/api/v1/transfers/{id}/void", hold2Id)
                .header("Idempotency-Key", "void-" + hold2Id))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("VOIDED"));
    }

    @Test
    @Order(8)
    @DisplayName("Transactions: Cursor-paginated listing with cryptographic hashes")
    void shouldListTransactionsWithCursorPagination() throws Exception {
        mockMvc.perform(get("/api/v1/transactions")
                .param("limit", "10")
                .param("afterSequence", "0"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(10))
            .andExpect(jsonPath("$[0].hash").isNotEmpty())
            .andExpect(jsonPath("$[0].prevHash").isNotEmpty())
            .andExpect(jsonPath("$[0].postings").isArray());
    }

    @Test
    @Order(9)
    @DisplayName("Simulator: High-throughput Virtual Thread burst generates valid transactions")
    void shouldExecuteBurstSimulation() throws Exception {
        BurstSimulationRequest burstReq = new BurstSimulationRequest(50, 10);

        mockMvc.perform(post("/api/v1/simulator/burst")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(burstReq)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.transactionsSuccessful").value(50))
            .andExpect(jsonPath("$.throughputTps").isNumber())
            .andExpect(jsonPath("$.merkleRoot").isNotEmpty());
    }

    @Test
    @Order(10)
    @DisplayName("Telemetry: Real-time stream endpoint connects successfully")
    void shouldConnectToTelemetryStream() throws Exception {
        mockMvc.perform(get("/api/v1/stream/transactions")
                .accept(MediaType.TEXT_EVENT_STREAM))
            .andExpect(status().isOk());
    }
}
