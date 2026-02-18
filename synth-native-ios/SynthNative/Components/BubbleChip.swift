//
//  BubbleChip.swift
//  SynthNative
//
//  TikTok-style selectable bubble for genre selection (Page 5).
//

import SwiftUI

struct BubbleChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                .foregroundColor(isSelected ? .white : SynthColor.neutral900)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, SynthSpacing.grouped)
                .padding(.vertical, SynthSpacing.small)
                .background(
                    RoundedRectangle(cornerRadius: SynthRadius.pill)
                        .fill(isSelected ? SynthColor.brandPink500 : Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: SynthRadius.pill)
                                .stroke(SynthColor.neutral200, lineWidth: isSelected ? 0 : 1)
                        )
                )
        }
        .buttonStyle(.plain)
    }
}
