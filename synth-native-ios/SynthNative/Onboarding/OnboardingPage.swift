//
//  OnboardingPage.swift
//  SynthNative
//
//  Protocol and container for onboarding pages.
//

import SwiftUI

protocol OnboardingPageView: View {
    var state: Binding<OnboardingState> { get }
    var onNext: () -> Void { get }
    var onSkip: () -> Void { get }
}

struct OnboardingPageContainer<Content: View>: View {
    let title: String
    let subtitle: String?
    let content: Content
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)?
    var canProceed: Bool = true

    init(
        title: String,
        subtitle: String? = nil,
        canProceed: Bool = true,
        onNext: @escaping () -> Void,
        onSkip: @escaping () -> Void,
        onBack: (() -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.canProceed = canProceed
        self.onNext = onNext
        self.onSkip = onSkip
        self.onBack = onBack
        self.content = content()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                if onBack != nil {
                    Button(action: { onBack?() }) {
                        HStack(spacing: SynthSpacing.inline) {
                            Image(systemName: "chevron.left")
                                .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                            Text("Back")
                                .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                        }
                        .foregroundColor(SynthColor.neutral600)
                    }
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                    .padding(.bottom, SynthSpacing.small)
                }

                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text(title)
                        .font(SynthFont.font(size: SynthTypography.h2.size, weight: SynthTypography.h2.weight))
                        .foregroundColor(SynthColor.neutral900)
                    if let sub = subtitle {
                        Text(sub)
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: SynthTypography.meta.weight))
                            .foregroundColor(SynthColor.neutral600)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SynthSpacing.screenMarginX)

                content

                HStack(spacing: SynthSpacing.small) {
                    PrimaryButton(title: "Skip", style: .secondary, action: onSkip)
                    PrimaryButton(title: "Next", style: .primary, action: onNext)
                        .opacity(canProceed ? 1 : 0.5)
                        .disabled(!canProceed)
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)
                .padding(.top, SynthSpacing.grouped)
            }
            .padding(.vertical, SynthSpacing.grouped)
        }
        .background(SynthColor.neutral50)
    }
}
