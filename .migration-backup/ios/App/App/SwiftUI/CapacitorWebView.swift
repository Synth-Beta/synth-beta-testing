//
//  CapacitorWebView.swift
//  Synth
//
//  Embeds the Capacitor web app (React) to preserve all backend functionality.
//  Loads the full web app after native auth/onboarding.
//

import SwiftUI
import Capacitor
import WebKit
import SynthNative

/// SwiftUI wrapper for CAPBridgeViewController - hosts the full web app with all functionality.
struct CapacitorWebView: UIViewControllerRepresentable {

    func makeUIViewController(context: Context) -> CAPBridgeViewController {
        let bridgeVC = CAPBridgeViewController()
        context.coordinator.bridgeVC = bridgeVC
        return bridgeVC
    }

    func updateUIViewController(_ uiViewController: CAPBridgeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator: NSObject, WKScriptMessageHandler {
        var bridgeVC: CAPBridgeViewController?
        private var hasAttachedHandlers = false

        override init() {
            super.init()
            // Attach handlers when bridge VC's webView is ready (retry until found)
            for delay in [0.1, 0.3, 0.6, 1.0] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                    self?.attachHandlersIfNeeded()
                }
            }
        }

        private func attachHandlersIfNeeded() {
            guard let webView = bridgeVC?.webView else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.attachHandlersIfNeeded()
                }
                return
            }
            attachHandlers(to: webView)
        }

        private func attachHandlers(to webView: WKWebView) {
            guard !hasAttachedHandlers else { return }
            hasAttachedHandlers = true
            let config = webView.configuration
            config.userContentController.add(self, name: "synthGetSession")
            let script = """
            (function() {
                window.__synthRequestNativeSession = function() {
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.synthGetSession) {
                        window.webkit.messageHandlers.synthGetSession.postMessage({});
                    }
                };
                window.__synthNativeSessionReady = function(session) {
                    window.dispatchEvent(new CustomEvent('synthNativeSessionReady', { detail: session }));
                };
            })();
            """
            config.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
            // Notify AppDelegate so it can attach appleSignIn, eventShare, setBadgeCount handlers
            NotificationCenter.default.post(
                name: NSNotification.Name("CapacitorWebViewReady"),
                object: nil,
                userInfo: ["webView": webView]
            )
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "synthGetSession" {
                Task {
                    await sendSessionToWeb()
                }
            }
        }

        private func sendSessionToWeb() async {
            guard let webView = bridgeVC?.webView else { return }
            guard let tokens = await AuthService.sessionTokensForWebBridge() else {
                return
            }
            let accessToken = tokens.accessToken
            let refreshToken = tokens.refreshToken
            let escapedAccess = accessToken.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
            let escapedRefresh = refreshToken.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "\n", with: "\\n")
                .replacingOccurrences(of: "\r", with: "\\r")
            let script = """
            (function() {
                try {
                    var session = {
                        access_token: '\(escapedAccess)',
                        refresh_token: '\(escapedRefresh)'
                    };
                    // Prefer the helper if it was injected (subsequent loads),
                    // otherwise dispatch the event directly so the first load works too.
                    if (typeof window.__synthNativeSessionReady === 'function') {
                        window.__synthNativeSessionReady(session);
                    } else {
                        window.dispatchEvent(new CustomEvent('synthNativeSessionReady', { detail: session }));
                    }
                } catch(e) {
                    console.error('Synth native session injection error:', e);
                }
            })();
            """
            await MainActor.run {
                webView.evaluateJavaScript(script) { _, error in
                    if let error = error {
                        print("Synth: Failed to inject session: \(error.localizedDescription)")
                    }
                }
            }
        }
    }
}
