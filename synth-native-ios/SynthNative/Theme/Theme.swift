//
//  Theme.swift
//  SynthNative
//
//  Design tokens for Synth onboarding.
//

import SwiftUI

enum SynthColor {
    static let neutral0 = Color(hex: "var(--neutral-0)")
    static let neutral50 = Color(hex: "var(--neutral-50)")
    static let neutral100 = Color(hex: "var(--neutral-100)")
    static let neutral200 = Color(hex: "var(--neutral-200)")
    static let neutral400 = Color(hex: "var(--neutral-400)")
    static let neutral600 = Color(hex: "var(--neutral-600)")
    static let neutral900 = Color(hex: "var(--neutral-900)")
    static let brandPink500 = Color(hex: "var(var(--brand-pink-500))")
}

enum SynthTypography {
    static let fontFamily = "Inter"
    static let h1 = (size: CGFloat(28), weight: Font.Weight.bold)
    static let h2 = (size: CGFloat(24), weight: Font.Weight.bold)
    static let body = (size: CGFloat(18), weight: Font.Weight.medium)
    static let meta = (size: CGFloat(16), weight: Font.Weight.medium)
}

enum SynthSpacing {
    static let inline: CGFloat = 6
    static let small: CGFloat = 12
    static let grouped: CGFloat = 24
    static let screenMarginX: CGFloat = 20
}

enum SynthRadius {
    static let corner: CGFloat = 10
    static let pill: CGFloat = 999
}

enum SynthSizes {
    static let inputHeight: CGFloat = 44
}

enum SynthFont {
    static func font(size: CGFloat, weight: Font.Weight) -> Font {
        .system(size: size, weight: weight)
    }
}

extension Color {
    init(hex: String) {
        let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&value)
        let red = Double((value >> 16) & 0xFF) / 255.0
        let green = Double((value >> 8) & 0xFF) / 255.0
        let blue = Double(value & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }
}
