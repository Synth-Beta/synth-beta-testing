import Foundation
import UIKit
import SwiftUI
import WebKit

// MARK: - Event Share Handler

/// Coordinates the Synth share flow:
///   1. Presents the native share bottom-sheet (SynthShareCardImageView preview)
///   2. On "Share Card": renders the card to UIImage → UIActivityViewController
///   3. On "Send in Chat": fires a CustomEvent back to the web layer
@available(iOS 15.0, *)
class EventShareHandler {
    static let shared = EventShareHandler()

    private var currentModal: UIViewController?
    private init() {}

    // ─────────────────────────────────────────────────────────────────
    // MARK: Present share bottom-sheet
    // ─────────────────────────────────────────────────────────────────

    func presentShareModal(
        event: EventShareData,
        from viewController: UIViewController,
        onShareExternally: @escaping () -> Void,
        onShareInChat:     @escaping () -> Void
    ) {
        dismissCurrentModal()

        let modalVC = EventShareModalViewController(
            event: event,
            onShareExternally: { [weak self] in
                onShareExternally()
                self?.dismissCurrentModal()
            },
            onShareInChat: { [weak self] in
                onShareInChat()
                self?.dismissCurrentModal()
            }
        )

        modalVC.modalPresentationStyle = .overFullScreen
        modalVC.modalTransitionStyle   = .crossDissolve
        modalVC.view.backgroundColor   = .clear

        currentModal = modalVC

        DispatchQueue.main.async {
            viewController.present(modalVC, animated: true)
        }
    }

    func dismissCurrentModal() {
        guard let modal = currentModal else { return }
        DispatchQueue.main.async {
            modal.dismiss(animated: true) { [weak self] in
                self?.currentModal = nil
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Share externally — renders card image then shows share sheet
    // ─────────────────────────────────────────────────────────────────

    func shareExternally(
        event:      EventShareData,
        from viewController: UIViewController,
        completion: @escaping (Bool) -> Void
    ) {
        Task { @MainActor in
            // Build the card data model
            let shareUrl = URL(string: event.isReview
                ? "https://join.getsynth.app/share?review=\(event.reviewId ?? event.eventId)"
                : "https://join.getsynth.app/share?event=\(event.eventId)"
            ) ?? URL(string: "https://join.getsynth.app")!

            let cardData = event.isReview
                ? SynthShareCardData.fromReview(event, shareUrl: shareUrl)
                : SynthShareCardData.fromEvent(event, shareUrl: shareUrl)

            // Render card image (downloads artwork + draws to UIImage)
            let cardImage = await SynthShareCardRenderer.shared.renderCard(for: cardData)

            // Build activity items:
            //   • UIImage — shown as inline photo; Instagram/Snapchat pick this up for Stories
            //   • URL     — iMessage shows rich link preview using our OG tags
            var items: [Any] = []
            if let image = cardImage { items.append(image) }
            items.append(shareUrl)

            let activityVC = UIActivityViewController(
                activityItems: items,
                applicationActivities: nil
            )

            // iPad popover anchor
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = viewController.view
                popover.sourceRect = CGRect(
                    x: viewController.view.bounds.midX,
                    y: viewController.view.bounds.maxY - 100,
                    width: 0, height: 0
                )
                popover.permittedArrowDirections = []
            }

            activityVC.completionWithItemsHandler = { _, completed, _, _ in
                completion(completed)
            }

            // Make sure we are not presenting on top of something already dismissed
            var presenter = viewController
            while let presented = presenter.presentedViewController {
                presenter = presented
            }

            DispatchQueue.main.async {
                presenter.present(activityVC, animated: true)
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Share in chat — fires CustomEvent to web layer
    // ─────────────────────────────────────────────────────────────────

    func shareInChat(event: EventShareData, completion: @escaping () -> Void) {
        sendEventToWebLayer(event: event, action: "shareInChat")
        completion()
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Web layer bridge
    // ─────────────────────────────────────────────────────────────────

    private func sendEventToWebLayer(event: EventShareData, action: String) {
        guard let eventData = try? JSONEncoder().encode(event),
              let eventJSON = String(data: eventData, encoding: .utf8) else { return }

        // Safely escape for inline JavaScript
        let escaped = eventJSON
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'",  with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\"", with: "\\\"")

        let script = """
        (function() {
            try {
                const d = JSON.parse('\(escaped)');
                window.dispatchEvent(new CustomEvent('NativeShareEvent', {
                    detail: { action: '\(action)', event: d }
                }));
            } catch(e) {
                console.error('NativeShareEvent dispatch error:', e);
            }
        })();
        """

        DispatchQueue.main.async {
            guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let window = scene.windows.first else { return }
            self.evaluateInWebView(script: script, window: window)
        }
    }

    private func evaluateInWebView(script: String, window: UIWindow) {
        func find(_ view: UIView) -> WKWebView? {
            if let wv = view as? WKWebView { return wv }
            for sub in view.subviews { if let wv = find(sub) { return wv } }
            return nil
        }
        guard let root = window.rootViewController?.view,
              let wv = find(root) else { return }
        wv.evaluateJavaScript(script) { _, error in
            if let error {
                print("Synth shareInChat JS error: \(error.localizedDescription)")
            }
        }
    }
}
