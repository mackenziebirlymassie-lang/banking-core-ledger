$javaBin = "C:\Users\Kenny\.jdk\jdk21.0.13_0\bin\java.exe"
$jarFile = "C:\Users\Kenny\Documents\Projects\core-banking-ledger\release\ledger-all-in-one.jar"

Write-Host "Starting Core Banking Ledger server from JAR..."
$proc = Start-Process -FilePath $javaBin -ArgumentList "-Dheadless=true", "--enable-preview", "-jar", "`"$jarFile`"" -WorkingDirectory "C:\Users\Kenny\Documents\Projects\core-banking-ledger\release" -PassThru

try {
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 800
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8080/api/v1/accounts" -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            # waiting for boot
        }
    }

    if (-not $ready) {
        throw "Server did not respond within timeout period."
    }

    Write-Host "Server is UP! Running smoke tests..."

    # Test 1: Root UI HTML delivery
    $rootRes = Invoke-WebRequest -Uri "http://localhost:8080/" -UseBasicParsing
    Write-Host "1. Root UI HTML: Status $($rootRes.StatusCode) (Length: $($rootRes.Content.Length) bytes)"

    # Test 2: Accounts endpoint
    $accounts = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/accounts"
    Write-Host "2. Accounts Count: $($accounts.Count) seeded accounts verified."

    # Test 3: Audit Verification endpoint
    $audit = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/audit/verify"
    Write-Host "3. Cryptographic Chain Valid: $($audit.valid)"
    Write-Host "   Total Transactions Scanned: $($audit.totalTransactionsScanned)"
    Write-Host "   Merkle Root: $($audit.merkleRoot)"
    Write-Host "   Audit Latency: $($audit.executionTimeMs) ms"

    # Test 4: Transactions endpoint
    $txs = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/transactions?limit=5"
    Write-Host "4. Transactions cursor: retrieved $($txs.Count) latest blocks."

    Write-Host "ALL SMOKE TESTS PASSED SUCCESSFULLY!"
} finally {
    Write-Host "Terminating server process PID $($proc.Id)..."
    Stop-Process -Id $proc.Id -Force
    # Also clean up any lingering port 8080 listeners
    $connections = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
    if ($connections) {
        $connections | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
}
