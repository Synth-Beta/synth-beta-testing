//
//  GlassCard.swift
//  SynthNative
//
//  Reusable glassmorphism container for onboarding pages.
//

import SwiftUI

struct GlassCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(SynthSpacing.grouped)
            .background(
                RoundedRectangle(cornerRadius: SynthRadius.corner * 2)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: SynthRadius.corner * 2)
                            .stroke(Color.white.opacity(0.3), lineWidth: 1)
                    )
            )
    }
}
