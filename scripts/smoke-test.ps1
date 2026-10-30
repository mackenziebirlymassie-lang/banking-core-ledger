# Phase 5.1 End-to-End Smoke Test Script
# Verifies native Windows CoreBankingLedger.exe launcher, full-stack fat JAR, inlined static assets, and 25-tx audit chain

$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\Kenny\Documents\Projects\core-banking-ledger"
$releaseDir  = "$projectRoot\release"
$exePath     = "$releaseDir\CoreBankingLedger.exe"
$stopBat     = "$releaseDir\Stop-Ledger-Server.bat"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   CORE BANKING LEDGER - END-TO-END SMOKE TEST (PHASE 5.1)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 0: Ensure port 8080 is free and wipe runtime data for pristine seed verification
Write-Host "[Step 0] Cleaning environment and ensuring port 8080 is free..." -ForegroundColor Yellow
& cmd.exe /c "`"$stopBat`""
Start-Sleep -Seconds 1

if (Test-Path "$releaseDir\data") {
    Remove-Item -Path "$releaseDir\data" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "         Pristine database state initialized (wiped $releaseDir\data)." -ForegroundColor Gray
}

# Step 1: Launch CoreBankingLedger.exe directly
Write-Host "[Step 1] Launching CoreBankingLedger.exe..." -ForegroundColor Yellow
$proc = Start-Process -FilePath $exePath -WorkingDirectory $releaseDir -PassThru
Write-Host "         Launched CoreBankingLedger.exe (PID: $($proc.Id))" -ForegroundColor Gray

# Step 2: Poll health endpoint
Write-Host "[Step 2] Polling health check on http://localhost:8080/api/v1/accounts..." -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 600
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/accounts" -UseBasicParsing -TimeoutSec 2
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {
        # Waiting for Java 21 Spring Boot + H2/Flyway + WAL initialization
    }
}

if (-not $ready) {
    Write-Host "ERROR: CoreBankingLedger backend failed to respond on port 8080 within timeout." -ForegroundColor Red
    & cmd.exe /c "`"$stopBat`""
    exit 1
}

Write-Host "         Backend is ONLINE and responding (200 OK)!" -ForegroundColor Green

try {
    # Test 1: Root UI Delivery (> 300 KB inlined single-file)
    Write-Host ""
    Write-Host "[Test 1] Root UI HTML Delivery..." -ForegroundColor Yellow
    $rootRes = Invoke-WebRequest -Uri "http://localhost:8080/" -UseBasicParsing
    $htmlLength = $rootRes.Content.Length
    Write-Host "         HTTP Status: $($rootRes.StatusCode)" -ForegroundColor Gray
    Write-Host "         Payload Size: $htmlLength bytes" -ForegroundColor Gray
    if ($htmlLength -lt 300000) {
        throw "Root HTML delivery failed size check: expected > 300,000 bytes, got $htmlLength bytes."
    }
    Write-Host "         PASSED: Inlined mission-control workbench verified ($htmlLength bytes > 300 KB)." -ForegroundColor Green

    # Test 2: Institutional Chart of Accounts
    Write-Host ""
    Write-Host "[Test 2] Chart of Accounts Verification..." -ForegroundColor Yellow
    $accounts = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/accounts"
    Write-Host "         Total Accounts: $($accounts.Count)" -ForegroundColor Gray
    if ($accounts.Count -ne 7) {
        throw "Accounts count check failed: expected 7 accounts, got $($accounts.Count)."
    }
    $accountNumbers = ($accounts | ForEach-Object { $_.accountNumber }) -join ", "
    Write-Host "         Accounts: $accountNumbers" -ForegroundColor Gray
    Write-Host "         PASSED: All 7 institutional accounts verified." -ForegroundColor Green

    # Test 3: Cryptographic SHA-256 Audit Chain Verification
    Write-Host ""
    Write-Host "[Test 3] Cryptographic SHA-256 Audit Chain Verification..." -ForegroundColor Yellow
    $audit = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/audit/verify"
    Write-Host "         Chain Valid: $($audit.valid)" -ForegroundColor Gray
    Write-Host "         Total Transactions Scanned: $($audit.totalTransactionsScanned)" -ForegroundColor Gray
    Write-Host "         Merkle Root: $($audit.merkleRoot)" -ForegroundColor Gray
    Write-Host "         Execution Latency: $($audit.executionTimeMs) ms" -ForegroundColor Gray

    if ($audit.valid -ne $true) {
        throw "Audit verification failed: cryptographic chain is invalid!"
    }
    if ($audit.totalTransactionsScanned -ne 25) {
        throw "Audit count check failed: expected exactly 25 transactions, got $($audit.totalTransactionsScanned)."
    }
    Write-Host "         PASSED: Cryptographic integrity verified across all 25 seeded transactions!" -ForegroundColor Green

    # Test 4: Cursor-Paginated Transaction Feed
    Write-Host ""
    Write-Host "[Test 4] Cursor-Paginated Transaction Feed..." -ForegroundColor Yellow
    $txs = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/transactions?limit=25"
    Write-Host "         Retrieved Transactions: $($txs.Count)" -ForegroundColor Gray
    if ($txs.Count -ne 25) {
        throw "Transaction count check failed: expected 25 transactions, got $($txs.Count)."
    }
    $latest = $txs[0]
    Write-Host "         Latest Block #$($latest.sequenceNum): Hash=$($latest.hash.Substring(0, 16))... PrevHash=$($latest.prevHash.Substring(0, 16))..." -ForegroundColor Gray
    Write-Host "         PASSED: All 25 historical blocks sequenced with SHA-256 links." -ForegroundColor Green

} finally {
    # Step 5: Clean shutdown via Stop-Ledger-Server.bat
    Write-Host ""
    Write-Host "[Step 5] Shutting down server via Stop-Ledger-Server.bat..." -ForegroundColor Yellow
    & cmd.exe /c "`"$stopBat`""
    Start-Sleep -Seconds 1

    # Verify port 8080 is freed
    $conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "WARNING: Port 8080 still has listeners. Terminating PID $($conn.OwningProcess)..." -ForegroundColor Red
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "         Port 8080 cleanly released." -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   ALL PHASE 5.1 VERIFICATION CHECKS PASSED WITH ZERO DEFECTS" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
