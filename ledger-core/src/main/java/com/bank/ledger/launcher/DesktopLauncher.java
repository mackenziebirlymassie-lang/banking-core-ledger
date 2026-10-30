package com.bank.ledger.launcher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.awt.Desktop;
import java.net.URI;

/**
 * Automatically launches a chromeless desktop mission-control window on startup
 * unless running in a headless or automated test environment.
 */
@Component
public class DesktopLauncher {

    private static final Logger log = LoggerFactory.getLogger(DesktopLauncher.class);

    @Value("${server.port:8080}")
    private int serverPort;

    @Value("${ledger.desktop.auto-launch:true}")
    private boolean autoLaunch;

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        String headlessProp = System.getProperty("headless", System.getProperty("java.awt.headless", "false"));
        if ("true".equalsIgnoreCase(headlessProp) || !autoLaunch) {
            log.info("[DesktopLauncher] Headless mode enabled; skipping native window launch.");
            return;
        }

        String targetUrl = "http://localhost:" + serverPort;
        log.info("[DesktopLauncher] Application ready. Launching mission-control window for: {}", targetUrl);

        Thread.ofVirtual().start(() -> {
            try {
                // Short pause to ensure all filters and listeners are ready
                Thread.sleep(500);

                String os = System.getProperty("os.name", "").toLowerCase();
                if (os.contains("win")) {
                    try {
                        Process process = new ProcessBuilder(
                            "cmd", "/c", "start", "msedge",
                            "--app=" + targetUrl,
                            "--window-size=1440,900"
                        ).start();
                        if (process.waitFor() == 0) {
                            return;
                        }
                    } catch (Exception ex) {
                        log.debug("Edge app mode launch attempt: {}", ex.getMessage());
                    }

                    try {
                        Process process = new ProcessBuilder(
                            "cmd", "/c", "start", "chrome",
                            "--app=" + targetUrl,
                            "--window-size=1440,900"
                        ).start();
                        if (process.waitFor() == 0) {
                            return;
                        }
                    } catch (Exception ex) {
                        log.debug("Chrome app mode launch attempt: {}", ex.getMessage());
                    }
                }

                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                    Desktop.getDesktop().browse(URI.create(targetUrl));
                } else {
                    log.info("[DesktopLauncher] Workbench accessible at: {}", targetUrl);
                }
            } catch (Exception e) {
                log.info("[DesktopLauncher] Browser launcher notice: {} (UI available at {})", e.getMessage(), targetUrl);
            }
        });
    }
}
