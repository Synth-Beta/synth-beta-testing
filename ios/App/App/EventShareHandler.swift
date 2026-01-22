import Foundation
import UIKit
import SwiftUI
import WebKit

/// Handler for presenting event share modal and managing share actions
@available(iOS 15.0, *)
class EventShareHandler {
    static let shared = EventShareHandler()
    
    private var currentModal: UIViewController?
    private var shareCompletion: ((String) -> Void)?
    
    private init() {}
    
    /// Presents the share modal for an event
    func presentShareModal(
        event: EventShareData,
        from viewController: UIViewController,
        onShareExternally: @escaping () -> Void,
        onShareInChat: @escaping () -> Void
    ) {
        // Dismiss any existing modal first
        dismissCurrentModal()
        
        let modalVC = EventShareModalViewController(
            event: event,
            onShareExternally: {
                onShareExternally()
                self.dismissCurrentModal()
            },
            onShareInChat: {
                onShareInChat()
                self.dismissCurrentModal()
            }
        )
        
        modalVC.modalPresentationStyle = .overFullScreen
        modalVC.modalTransitionStyle = .coverVertical
        
        // Make the presentation context semi-transparent
        modalVC.view.backgroundColor = .clear
        
        currentModal = modalVC
        
        DispatchQueue.main.async {
            viewController.present(modalVC, animated: true)
        }
    }
    
    /// Dismisses the current modal if present
    func dismissCurrentModal() {
        if let modal = currentModal {
            DispatchQueue.main.async {
                modal.dismiss(animated: true) {
                    self.currentModal = nil
                }
            }
        }
    }
    
    /// Handles external share using iOS native share sheet
    func shareExternally(
        event: EventShareData,
        from viewController: UIViewController,
        completion: @escaping (Bool) -> Void
    ) {
        // Build share text
        var shareText = event.title
        if let venue = event.venueName {
            shareText += " at \(venue)"
        }
        if let date = event.eventDate {
            shareText += " on \(formatDate(date))"
        }
        
        // Build share URL (you may need to adjust this based on your app's URL scheme)
        let shareURL = URL(string: "https://plusone.app/?event=\(event.eventId)") ?? URL(string: "https://plusone.app")!
        
        let activityVC = UIActivityViewController(
            activityItems: [shareText, shareURL],
            applicationActivities: nil
        )
        
        // Configure for iPad
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = viewController.view
            popover.sourceRect = CGRect(x: viewController.view.bounds.midX, y: viewController.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        
        activityVC.completionWithItemsHandler = { activityType, completed, returnedItems, error in
            completion(completed)
        }
        
        DispatchQueue.main.async {
            viewController.present(activityVC, animated: true)
        }
    }
    
    /// Handles share in chat (triggers callback to web layer)
    func shareInChat(event: EventShareData, completion: @escaping () -> Void) {
        // Send event to web layer to handle in-app sharing
        sendEventToWebLayer(event: event, action: "shareInChat")
        completion()
    }
    
    /// Sends event data to web layer for processing
    private func sendEventToWebLayer(event: EventShareData, action: String) {
        guard let eventData = try? JSONEncoder().encode(event),
              let eventJSON = String(data: eventData, encoding: .utf8) else {
            print("Failed to encode event data")
            return
        }
        
        // Escape JSON for JavaScript
        let escapedJSON = eventJSON
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\"", with: "\\\"")
        
        let script = """
            (function() {
                try {
                    const eventData = JSON.parse('\(escapedJSON)');
                    window.dispatchEvent(new CustomEvent('NativeShareEvent', {
                        detail: {
                            action: '\(action)',
                            event: eventData
                        }
                    }));
                } catch(e) {
                    console.error('Error dispatching NativeShareEvent:', e);
                }
            })();
        """
        
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                self.evaluateJavaScriptInWebView(script: script, in: window)
            }
        }
    }
    
    /// Helper to evaluate JavaScript in web view
    private func evaluateJavaScriptInWebView(script: String, in window: UIWindow) {
        func findWebView(in view: UIView) -> WKWebView? {
            if let webView = view as? WKWebView {
                return webView
            }
            for subview in view.subviews {
                if let webView = findWebView(in: subview) {
                    return webView
                }
            }
            return nil
        }
        
        if let rootView = window.rootViewController?.view,
           let webView = findWebView(in: rootView) {
            webView.evaluateJavaScript(script) { result, error in
                if let error = error {
                    print("WebView JavaScript evaluation failed: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        if let date = formatter.date(from: dateString) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }
        
        return dateString
    }
}
