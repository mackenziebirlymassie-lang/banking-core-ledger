using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

namespace CoreBankingLedger
{
    class Program
    {
        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string jarPath = Path.Combine(baseDir, "ledger-all-in-one.jar");

            if (!File.Exists(jarPath))
            {
                // Fallback check parent directory
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
                    System.Windows.Forms.MessageBox.Show(
                        "Could not locate ledger-all-in-one.jar in:\n" + baseDir,
                        "Core Banking Ledger Error",
                        System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Error
                    );
                    return;
                }

                string javaExe = FindJavaExecutable(consoleMode);

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = javaExe;
                psi.Arguments = "-Dheadless=true --enable-preview -jar \"" + jarPath + "\"";
                psi.WorkingDirectory = baseDir;
                psi.UseShellExecute = false;

                if (!consoleMode)
                {
                    psi.CreateNoWindow = true;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;
                }

                try
                {
                    Process.Start(psi);
                }
                catch (Exception ex)
                {
                    System.Windows.Forms.MessageBox.Show(
                        "Failed to launch Java runtime (" + javaExe + "):\n" + ex.Message,
                        "Core Banking Ledger Error",
                        System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Error
                    );
                    return;
                }

                // 2. Poll until backend is online (up to 30s)
                int retries = 75;
                bool ready = false;
                while (retries-- > 0)
                {
                    Thread.Sleep(400);
                    if (IsBackendAlive(healthUrl))
                    {
                        ready = true;
                        break;
                    }
                }

                if (!ready)
                {
                    System.Windows.Forms.MessageBox.Show(
                        "Ledger backend did not respond within 30 seconds on port 8080.",
                        "Core Banking Ledger Warning",
                        System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Warning
                    );
                }
            }

            // 3. Open dedicated native app window
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

            // Check JAVA_HOME
            string javaHome = Environment.GetEnvironmentVariable("JAVA_HOME");
            if (!string.IsNullOrEmpty(javaHome))
            {
                string candidate = Path.Combine(javaHome, "bin", exeName);
                if (File.Exists(candidate)) return candidate;
            }

            // Check explicit known Corretto 21 JDK path
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string correttoPath = Path.Combine(userProfile, ".jdk", "jdk21.0.13_0", "bin", exeName);
            if (File.Exists(correttoPath)) return correttoPath;

            // Default to PATH
            return exeName;
        }

        static void LaunchBrowserApp(string targetUrl)
        {
            // Try Edge App Mode (Chromeless window)
            try
            {
                Process p = Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c start msedge --app=" + targetUrl + " --window-size=1440,900",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                p.WaitForExit(3000);
                return;
            }
            catch {}

            // Try Chrome App Mode
            try
            {
                Process p = Process.Start(new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c start chrome --app=" + targetUrl + " --window-size=1440,900",
                    CreateNoWindow = true,
                    UseShellExecute = false
                });
                p.WaitForExit(3000);
                return;
            }
            catch {}

            // Fallback default browser
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
            catch {}
        }
    }
}
