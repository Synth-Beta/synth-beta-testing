import SwiftUI

enum SynthTextStyle {
    case h1
    case h2
    case body
    case accent
    case meta
    case steps

    var typography: SynthTypography.Style {
        switch self {
        case .h1:
            return SynthTypography.h1
        case .h2:
            return SynthTypography.h2
        case .body:
            return SynthTypography.body
        case .accent:
            return SynthTypography.accent
        case .meta:
            return SynthTypography.meta
        case .steps:
            return SynthTypography.steps
        }
    }
}

extension Text {
    func synth(_ style: SynthTextStyle, color: Color? = nil) -> some View {
        let typography = style.typography
        let lineSpacing = max(0, typography.lineHeight - typography.size)

        return self
            .font(SynthFont.font(size: typography.size, weight: typography.weight))
            .lineSpacing(lineSpacing)
            .kerning(typography.letterSpacing ?? 0)
            .foregroundColor(color ?? typography.defaultColor)
    }
}
