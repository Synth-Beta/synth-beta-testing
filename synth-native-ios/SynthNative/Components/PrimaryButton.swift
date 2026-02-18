//
//  PrimaryButton.swift
//  SynthNative
//
//  Primary and secondary button styles for onboarding.
//

import SwiftUI

struct PrimaryButton: View {
    let title: String
    let style: ButtonStyle
    let action: () -> Void

    enum ButtonStyle {
        case primary
        case secondary
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(SynthFont.font(size: SynthTypography.body.size, weight: .semibold))
                .foregroundColor(style == .primary ? .white : SynthColor.neutral600)
                .frame(maxWidth: .infinity)
                .frame(height: SynthSizes.inputHeight)
                .background(
                    RoundedRectangle(cornerRadius: SynthRadius.corner)
                        .fill(style == .primary ? SynthColor.brandPink500 : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SynthRadius.corner)
                        .stroke(style == .secondary ? SynthColor.neutral200 : Color.clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}
