//
//  ShareOfferView.swift
//  Synth
//
//  Reusable $50 gift card share CTA. Used in top banner and at end of review flow.
//

import SwiftUI
import UIKit

/// App Store link for Synth. Append ?referral=<user_referral_code> when available to attribute shares.
let kSynthAppStoreURL = "https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095"

struct ShareOfferView: View {
    /// Optional referral code; if set, appended to share URL as ?referral=
    var referralCode: String? = nil
    /// Optional source for analytics (e.g. "banner", "review_flow")
    var source: String? = nil
    var compact: Bool = false
    var onShare: (() -> Void)?

    private var shareURL: String {
        guard let code = referralCode, !code.isEmpty else { return kSynthAppStoreURL }
        return "\(kSynthAppStoreURL)?referral=\(code)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.small) {
            Text("Share Synth with friends for a chance to win a $50 gift card!")
                .synth(compact ? .meta : .body, color: SynthColor.neutral900)
                .fixedSize(horizontal: false, vertical: true)

            SynthButton(
                "Share with friends",
                variant: .primary,
                size: .standard,
                icon: .share2,
                iconPosition: .left,
                fullWidth: true
            ) {
                presentShareSheet(url: shareURL, source: source)
                onShare?()
            }
        }
        .padding(SynthSpacing.small)
    }

    private func presentShareSheet(url: String, source: String?) {
        guard let urlObj = URL(string: url) else { return }
        let text = "Check out Synth — discover concerts, connect with music fans, and share your live music experiences."
        let items: [Any] = [text, urlObj]

        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let root = windowScene.windows.first?.rootViewController {
            var top = root
            while let presented = top.presentedViewController { top = presented }
            top.present(activityVC, animated: true)
        }
    }
}

#Preview {
    ShareOfferView(referralCode: nil, compact: false)
        .padding()
}
