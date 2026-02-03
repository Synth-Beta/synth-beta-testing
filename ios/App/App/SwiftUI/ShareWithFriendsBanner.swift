//
//  ShareWithFriendsBanner.swift
//  Synth
//
//  Dismissible top banner urging users to share with friends for a chance to win $50 gift card.
//

import SwiftUI
import UIKit

private let kShareBannerDismissedKey = "share_with_friends_banner_dismissed"

struct ShareWithFriendsBanner: View {
    var referralCode: String? = nil
    @Binding var isVisible: Bool

    var body: some View {
        HStack(alignment: .top, spacing: SynthSpacing.small) {
            VStack(alignment: .leading, spacing: SynthSpacing.inline) {
                Text("Share Synth with friends for a chance to win a $50 gift card!")
                    .synth(.meta, color: SynthColor.neutral900)
                    .fixedSize(horizontal: false, vertical: true)

                SynthButton(
                    "Share",
                    variant: .primary,
                    size: .tertiary,
                    action: {
                        presentShareSheet(url: shareURL)
                    }
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                UserDefaults.standard.set(true, forKey: kShareBannerDismissedKey)
                isVisible = false
            } label: {
                IconView(.x, size: SynthSizes.iconSmall, color: SynthColor.neutral600)
                    .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
            }
        }
        .padding(.horizontal, SynthSpacing.screenMarginX)
        .padding(.vertical, SynthSpacing.small)
        .background(
            LinearGradient(
                colors: [SynthColor.brandPink050, SynthColor.neutral50],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(SynthColor.neutral200),
            alignment: .bottom
        )
    }

    private var shareURL: String {
        guard let code = referralCode, !code.isEmpty else { return kSynthAppStoreURL }
        return "\(kSynthAppStoreURL)?referral=\(code)"
    }

    private func presentShareSheet(url: String) {
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

/// Returns whether the share banner has been dismissed by the user.
func isShareWithFriendsBannerDismissed() -> Bool {
    UserDefaults.standard.bool(forKey: kShareBannerDismissedKey)
}

#Preview {
    ShareWithFriendsBanner(referralCode: nil, isVisible: .constant(true))
}
