# test.ps1 - Automated test runner configuring portable JDK 21 and Maven
$ErrorActionPreference = "Stop"

$jdkDir = Get-ChildItem -Path "C:\Users\Kenny\.jdk" -Directory | Where-Object { $_.Name -like "*jdk*" } | Select-Object -First 1
$mvnDir = Get-ChildItem -Path "C:\Users\Kenny\.maven" -Directory | Where-Object { $_.Name -like "*maven*" } | Select-Object -First 1

if (-not $jdkDir) {
    Write-Error "JDK 21 not found in C:\Users\Kenny\.jdk"
    exit 1
}

if (-not $mvnDir) {
    Write-Error "Maven not found in C:\Users\Kenny\.maven"
    exit 1
}

$env:JAVA_HOME = $jdkDir.FullName
$env:PATH = "$($jdkDir.FullName)\bin;$($mvnDir.FullName)\bin;$env:PATH"

Write-Host "=========================================="
Write-Host "JAVA_HOME: $env:JAVA_HOME"
& "$($jdkDir.FullName)\bin\java.exe" -version
Write-Host "------------------------------------------"
Write-Host "MAVEN_HOME: $($mvnDir.FullName)"
& "$($mvnDir.FullName)\bin\mvn.cmd" -version
Write-Host "=========================================="

Push-Location "C:\Users\Kenny\Documents\Projects\core-banking-ledger\ledger-core"
try {
    & "$($mvnDir.FullName)\bin\mvn.cmd" clean test
} finally {
    Pop-Location
}
