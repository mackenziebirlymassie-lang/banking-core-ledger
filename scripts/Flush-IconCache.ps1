# Flush-IconCache.ps1
$csharp = @"
using System;
using System.Runtime.InteropServices;

public class ShellNotifier
{
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@

Add-Type -TypeDefinition $csharp -Language CSharp
[ShellNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

if (Test-Path "C:\Windows\System32\ie4uinit.exe") {
    Start-Process -FilePath "C:\Windows\System32\ie4uinit.exe" -ArgumentList "-show" -Wait -ErrorAction SilentlyContinue
}

Write-Host "Windows Shell icon cache successfully notified of association changes."
