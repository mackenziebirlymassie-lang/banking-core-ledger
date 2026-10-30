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
                    String localAppData = System.getenv("LOCALAPPDATA");
                    String[] browserCandidates = {
                        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                        localAppData != null ? localAppData + "\\Google\\Chrome\\Application\\chrome.exe" : null,
                        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
                        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                        "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                        localAppData != null ? localAppData + "\\imput\\Helium\\Application\\chrome.exe" : null
                    };

                    for (String candidate : browserCandidates) {
                        if (candidate != null && new java.io.File(candidate).exists()) {
                            try {
                                new ProcessBuilder(candidate, "--app=" + targetUrl, "--window-size=1440,900").start();
                                return;
                            } catch (Exception ex) {
                                log.debug("Browser app launch attempt failed for {}: {}", candidate, ex.getMessage());
                            }
                        }
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
