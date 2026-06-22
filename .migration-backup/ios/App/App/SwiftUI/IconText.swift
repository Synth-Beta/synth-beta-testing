import SwiftUI

enum IconTextPosition {
    case left
    case right
}

struct IconText: View {
    let text: String
    let icon: Icon
    let iconPosition: IconTextPosition
    var onClick: (() -> Void)? = nil
    var iconColor: Color = SynthColor.neutral900
    var textColor: Color = SynthColor.neutral900

    var body: some View {
        let content = HStack(spacing: SynthSpacing.inline) {
            if iconPosition == .left {
                IconView(icon, size: SynthSizes.iconStandard, color: iconColor)
                Text(text).synth(.body, color: textColor)
            } else {
                Text(text).synth(.body, color: textColor)
                IconView(icon, size: SynthSizes.iconStandard, color: iconColor)
            }
        }

        if let onClick {
            Button(action: onClick) {
                content
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
        } else {
            content
        }
    }
}
