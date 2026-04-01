import Foundation
import UIKit
import WebKit

// MARK: - SynthDeepLinkRouter
//
// Bridges Universal Link URLs into the web layer.
//
// Two scenarios:
//
//  A) App is INSTALLED, user taps share link
//     → iOS fires application(_:continue:restorationHandler:)
//     → AppDelegate calls SynthDeepLinkRouter.handle(url:)
//     → If web layer is ready:  fires CustomEvent immediately
//     → If web layer NOT ready: stores URL, fires when web layer signals ready
//
//  B) App is NOT INSTALLED
//     → User goes to App Store, installs, opens app fresh (no Universal Link)
//     → The /share OG page sets ?ref=USERID in the App Store URL for attribution
//     → Not handled natively; web layer checks URL params on first load

final class SynthDeepLinkRouter {
    static let shared = SynthDeepLinkRouter()
    private init() {}

    // Persists across the lifetime of this app launch (not across restarts).
    private var pendingUrl: URL?
    private var webLayerIsReady = false

    // Call from AppDelegate.application(_:continue:restorationHandler:)
    func handle(url: URL) {
        guard isSynthShareUrl(url) else { return }
        pendingUrl = url

        if webLayerIsReady {
            fireLinkEvent(url: url)
            pendingUrl = nil
        }
        // Otherwise: event will fire when markWebLayerReady() is called
    }

    // Called by the web layer when the React app is mounted and listening.
    // Fires a JS event with any stored URL so the app can navigate.
    func markWebLayerReady() {
        webLayerIsReady = true
        if let url = pendingUrl {
            fireLinkEvent(url: url)
            pendingUrl = nil
        }
    }

    /// Signals to the web layer that the native bottom navigation selected a tab.
    func notifyTabSelected(index: Int) {
        let script = """
        (function() {
            try {
                window.dispatchEvent(new CustomEvent('synthNativeTabSelected', {
                    detail: { index: \(index) }
                }));
            } catch(e) {
                console.error('synthNativeTabSelected dispatch error:', e);
            }
        })();
        """

        DispatchQueue.main.async {
            self.evaluateOnAvailableWebView(script: script)
        }
    }

    // MARK: - Private

    private func isSynthShareUrl(_ url: URL) -> Bool {
        guard let host = url.host else { return false }
        return host.contains("plusone.app") && url.path.hasPrefix("/share")
    }

    private func fireLinkEvent(url: URL) {
        let escaped = url.absoluteString
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'",  with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")

        let script = """
        (function() {
            try {
                window.dispatchEvent(new CustomEvent('synthDeepLink', {
                    detail: { url: '\(escaped)' }
                }));
            } catch(e) {
                console.error('synthDeepLink dispatch error:', e);
            }
        })();
        """

        DispatchQueue.main.async {
            self.evaluateOnAvailableWebView(script: script)
        }
    }

    private func evaluateOnAvailableWebView(script: String) {
        guard let scene  = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
        else { return }

        func findWebView(_ view: UIView) -> WKWebView? {
            if let wv = view as? WKWebView { return wv }
            for sub in view.subviews { if let wv = findWebView(sub) { return wv } }
            return nil
        }

        guard let root = window.rootViewController?.view,
              let wv = findWebView(root) else { return }

        wv.evaluateJavaScript(script) { _, error in
            if let error {
                print("Synth DeepLinkRouter JS error: \(error.localizedDescription)")
            }
        }
    }
}
