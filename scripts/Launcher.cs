using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace CoreBankingLedger
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string jarPath = Path.Combine(baseDir, "ledger-all-in-one.jar");

            if (!File.Exists(jarPath))
            {
                // Fallback check parent project directory
                string parentJar = Path.Combine(baseDir, "..", "ledger-core", "target", "ledger-core-1.0.0-SNAPSHOT.jar");
                if (File.Exists(parentJar))
                {
                    jarPath = Path.GetFullPath(parentJar);
                }
            }

            bool consoleMode = false;
            foreach (var arg in args)
            {
                if (arg.Equals("--console", StringComparison.OrdinalIgnoreCase))
                {
                    consoleMode = true;
                }
            }

            string targetUrl = "http://localhost:8080";
            string healthUrl = "http://localhost:8080/api/v1/accounts";

            // 1. Check if backend is already listening
            bool alreadyRunning = IsBackendAlive(healthUrl);

            if (!alreadyRunning)
            {
                if (!File.Exists(jarPath))
                {
                    MessageBox.Show(
                        "Could not locate ledger-all-in-one.jar in:\n" + baseDir +
                        "\n\nPlease ensure ledger-all-in-one.jar is located in the release folder.",
                        "Core Banking Ledger Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string javaExe = FindJavaExecutable(consoleMode);

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = javaExe;
                psi.Arguments = "-Dheadless=true --enable-preview -jar \"" + jarPath + "\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;
                psi.RedirectStandardError = true;
                psi.RedirectStandardOutput = false;

                if (!consoleMode)
                {
                    psi.CreateNoWindow = true;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                }

                Process javaProc = new Process();
                javaProc.StartInfo = psi;

                StringBuilder stderrBuffer = new StringBuilder();
                javaProc.ErrorDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        lock (stderrBuffer)
                        {
                            stderrBuffer.AppendLine(e.Data);
                        }
                    }
                };

                try
                {
                    javaProc.Start();
                    javaProc.BeginErrorReadLine();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Failed to launch Java runtime (" + javaExe + "):\n\n" + ex.Message +
                        "\n\nPlease ensure Java 21 is installed and available.",
                        "Core Banking Ledger Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // 2. Poll until backend is online (up to 30 seconds)
                int retries = 75;
                bool ready = false;
                while (retries-- > 0)
                {
                    if (javaProc.HasExited)
                    {
                        string errOut;
                        lock (stderrBuffer)
                        {
                            errOut = stderrBuffer.ToString().Trim();
                        }

                        MessageBox.Show(
                            "Ledger backend process terminated unexpectedly (Exit Code: " + javaProc.ExitCode + ").\n\n" +
                            (string.IsNullOrEmpty(errOut) ? "No standard error captured." : ("Error Output:\n" + errOut)),
                            "Core Banking Ledger Startup Error",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error
                        );
                        return;
                    }

                    Thread.Sleep(400);
                    if (IsBackendAlive(healthUrl))
                    {
                        ready = true;
                        break;
                    }
                }

                if (!ready)
                {
                    MessageBox.Show(
                        "Ledger backend did not respond within 30 seconds on port 8080.\n" +
                        "The application window will open, but service may still be initializing.",
                        "Core Banking Ledger Notice",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                }
            }

            // 3. Open single dedicated native app window (or default browser)
            LaunchBrowserApp(targetUrl);
        }

        static bool IsBackendAlive(string url)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 1200;
                req.Method = "GET";
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        static string FindJavaExecutable(bool consoleMode)
        {
            string exeName = consoleMode ? "java.exe" : "javaw.exe";

            // 1. Explicit user profile Corretto / JDK 21
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(userProfile))
            {
                string correttoPath = Path.Combine(userProfile, ".jdk", "jdk21.0.13_0", "bin", exeName);
                if (File.Exists(correttoPath)) return correttoPath;
            }

            // Fallback hardcoded user path
            string hardcodedJdk = @"C:\Users\Kenny\.jdk\jdk21.0.13_0\bin\" + exeName;
            if (File.Exists(hardcodedJdk)) return hardcodedJdk;

            // 2. JAVA_HOME
            string javaHome = Environment.GetEnvironmentVariable("JAVA_HOME");
            if (!string.IsNullOrEmpty(javaHome))
            {
                string candidate = Path.Combine(javaHome, "bin", exeName);
                if (File.Exists(candidate)) return candidate;
            }

            // 3. Program Files Java 21 standard locations
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            if (!string.IsNullOrEmpty(progFiles))
            {
                string candidate1 = Path.Combine(progFiles, "Java", "jdk-21", "bin", exeName);
                if (File.Exists(candidate1)) return candidate1;

                string candidate2 = Path.Combine(progFiles, "Eclipse Adoptium", "jdk-21", "bin", exeName);
                if (File.Exists(candidate2)) return candidate2;
            }

            // 4. Default to system PATH
            return exeName;
        }

        static void LaunchBrowserApp(string targetUrl)
        {
            // 1. Probe for installed Chromium browser for native chromeless app window
            string browserExe = FindChromiumBrowser();
            if (!string.IsNullOrEmpty(browserExe))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = "--app=" + targetUrl + " --window-size=1440,900",
                        UseShellExecute = false
                    });
                    return;
                }
                catch
                {
                    // If launching app-mode fails, continue to fallback
                }
            }

            // 2. Safe Fallback: Open URL directly in default system browser
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Ledger backend is ready at: " + targetUrl + "\n\nCould not launch browser automatically: " + ex.Message,
                    "Core Banking Ledger",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            }
        }

        static string FindChromiumBrowser()
        {
            List<string> candidates = new List<string>();

            // Query Windows Registry App Paths (most accurate registration)
            string[] browserNames = new string[] { "chrome.exe", "msedge.exe", "brave.exe" };
            foreach (string name in browserNames)
            {
                string regPath = ReadAppPathRegistry(name);
                if (!string.IsNullOrEmpty(regPath))
                {
                    candidates.Add(regPath);
                }
            }

            // Standard filesystem locations
            string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            if (!string.IsNullOrEmpty(progFiles))
            {
                candidates.Add(Path.Combine(progFiles, @"Google\Chrome\Application\chrome.exe"));
                candidates.Add(Path.Combine(progFiles, @"Microsoft\Edge\Application\msedge.exe"));
                candidates.Add(Path.Combine(progFiles, @"BraveSoftware\Brave-Browser\Application\brave.exe"));
            }

            if (!string.IsNullOrEmpty(progFilesX86))
            {
                candidates.Add(Path.Combine(progFilesX86, @"Google\Chrome\Application\chrome.exe"));
                candidates.Add(Path.Combine(progFilesX86, @"Microsoft\Edge\Application\msedge.exe"));
                candidates.Add(Path.Combine(progFilesX86, @"BraveSoftware\Brave-Browser\Application\brave.exe"));
            }

            if (!string.IsNullOrEmpty(localAppData))
            {
                candidates.Add(Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe"));
                candidates.Add(Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"));
                candidates.Add(Path.Combine(localAppData, @"BraveSoftware\Brave-Browser\Application\brave.exe"));
                candidates.Add(Path.Combine(localAppData, @"imput\Helium\Application\chrome.exe"));
            }

            foreach (string candidate in candidates)
            {
                try
                {
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch {}
            }

            return null;
        }

        static string ReadAppPathRegistry(string exeName)
        {
            try
            {
                using (RegistryKey key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exeName))
                {
                    if (key != null)
                    {
                        object val = key.GetValue(null);
                        if (val != null && File.Exists(val.ToString()))
                        {
                            return val.ToString();
                        }
                    }
                }
            }
            catch {}

            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exeName))
                {
                    if (key != null)
                    {
                        object val = key.GetValue(null);
                        if (val != null && File.Exists(val.ToString()))
                        {
                            return val.ToString();
                        }
                    }
                }
            }
            catch {}

            return null;
        }
    }
}
