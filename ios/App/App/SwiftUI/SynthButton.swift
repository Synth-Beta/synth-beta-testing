import SwiftUI

enum SynthButtonVariant {
    case primary
    case secondary
    case tertiary
    case ghost
    case disabled
}

enum SynthButtonSize {
    case standard
    case iconOnly
    case tertiary
}

enum SynthButtonIconPosition {
    case left
    case right
}

private struct SynthButtonStyle: ButtonStyle {
    let variant: SynthButtonVariant
    let size: SynthButtonSize
    let fullWidth: Bool

    func makeBody(configuration: Configuration) -> some View {
        let isPressed = configuration.isPressed && variant != .disabled
        let shouldScale = isPressed && variant == .primary

        configuration.label
            .font(SynthFont.font(size: SynthTypography.meta.size, weight: SynthTypography.meta.weight))
            .foregroundColor(textColor(isPressed: isPressed))
            .frame(height: height)
            .padding(.horizontal, horizontalPadding)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(backgroundColor(isPressed: isPressed))
            .overlay(border(isPressed: isPressed))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .shadow(color: shadowColor, radius: SynthShadow.radius, x: SynthShadow.x, y: SynthShadow.y)
            .scaleEffect(shouldScale ? 0.98 : 1.0)
            .animation(.easeOut(duration: 0.12), value: shouldScale)
    }

    private var height: CGFloat {
        switch size {
        case .iconOnly:
            return SynthSizes.inputHeight // 44
        case .tertiary:
            return SynthSizes.buttonTertiaryHeight // 22
        case .standard:
            return SynthSizes.buttonHeight // 36
        }
    }

    private var cornerRadius: CGFloat {
        switch size {
        case .tertiary:
            return SynthRadius.pill
        case .iconOnly, .standard:
            return SynthRadius.corner
        }
    }

    private func textColor(isPressed: Bool) -> Color {
        switch variant {
        case .primary:
            return SynthColor.neutral50
        case .secondary, .tertiary:
            return SynthColor.brandPink500
        case .ghost:
            return isPressed ? SynthColor.brandPink500 : SynthColor.neutral600
        case .disabled:
            return SynthColor.stateDisabledText
        }
    }

    private var horizontalPadding: CGFloat {
        switch size {
        case .iconOnly:
            return 0
        case .standard, .tertiary:
            return SynthSpacing.small
        }
    }

    private func backgroundColor(isPressed: Bool) -> Color {
        switch variant {
        case .primary:
            // Active state uses brandPink700 + scale 0.98
            return isPressed ? SynthColor.brandPink700 : SynthColor.brandPink500
        case .secondary:
            // Guide hover/active differs; in SwiftUI we implement pressed feedback with scale and optional subtle bg shift
            return isPressed ? SynthColor.brandPink050 : SynthColor.neutral50
        case .tertiary:
            return SynthColor.brandPink050
        case .ghost:
            return isPressed ? SynthColor.brandPink050 : .clear
        case .disabled:
            return SynthColor.stateDisabledBg
        }
    }

    private func border(isPressed: Bool) -> some View {
        let lineWidth: CGFloat = (variant == .secondary || variant == .tertiary) ? 2 : 0

        let strokeColor: Color = {
            switch variant {
            case .secondary:
                return isPressed ? SynthColor.brandPink600 : SynthColor.brandPink500
            case .tertiary:
                return SynthColor.brandPink500
            case .primary, .ghost, .disabled:
                return .clear
            }
        }()

        return RoundedRectangle(cornerRadius: cornerRadius)
            .stroke(strokeColor, lineWidth: lineWidth)
    }

    private var shadowColor: Color {
        if size == .tertiary || variant == .ghost || variant == .disabled {
            return .clear
        }
        return (variant == .primary || variant == .secondary) ? SynthShadow.color : .clear
    }
}

struct SynthButton: View {
    let title: String?
    let variant: SynthButtonVariant
    let size: SynthButtonSize
    let icon: Icon?
    let iconPosition: SynthButtonIconPosition
    let fullWidth: Bool
    let action: () -> Void

    init(
        _ title: String,
        variant: SynthButtonVariant,
        size: SynthButtonSize = .standard,
        icon: Icon? = nil,
        iconPosition: SynthButtonIconPosition = .left,
        fullWidth: Bool = false,
        action: @escaping () -> Void = {}
    ) {
        self.title = title
        self.variant = variant
        self.size = size
        self.icon = icon
        self.iconPosition = iconPosition
        self.fullWidth = fullWidth
        self.action = action
    }

    init(
        icon: Icon,
        variant: SynthButtonVariant,
        action: @escaping () -> Void = {}
    ) {
        self.title = nil
        self.variant = variant
        self.size = .iconOnly
        self.icon = icon
        self.iconPosition = .left
        self.fullWidth = false
        self.action = action
    }

    var body: some View {
        let effectiveVariant = variant
        let effectiveSize = variant == .tertiary ? .tertiary : size
        let allowsIconOnly = effectiveVariant == .primary || effectiveVariant == .secondary || effectiveVariant == .disabled
        let isIconOnly = effectiveSize == .iconOnly && allowsIconOnly
        let usesFullWidth = (effectiveSize != .tertiary) && !isIconOnly && fullWidth

        Button(action: action) {
            if isIconOnly, let icon {
                IconView(icon, size: SynthSizes.iconStandard, color: iconColor)
                    .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
            } else {
                HStack(spacing: SynthSpacing.inline) {
                    if let icon, iconPosition == .left {
                        IconView(icon, size: iconSize, color: iconColor)
                    }
                    if let title {
                        Text(title)
                    }
                    if let icon, iconPosition == .right {
                        IconView(icon, size: iconSize, color: iconColor)
                    }
                }
            }
        }
        .buttonStyle(SynthButtonStyle(variant: effectiveVariant, size: effectiveSize, fullWidth: usesFullWidth))
        .padding(isIconOnly ? SynthSpacing.small : .zero)
        .padding(.vertical, isIconOnly ? 0 : SynthSpacing.small)
        .padding(.horizontal, usesFullWidth ? SynthSpacing.screenMarginX : 0)
        .disabled(effectiveVariant == .disabled)
    }

    private var iconSize: CGFloat {
        switch size {
        case .tertiary:
            return SynthSizes.iconSmall
        case .iconOnly, .standard:
            return SynthSizes.iconStandard
        }
    }

    private var iconColor: Color {
        switch variant {
        case .primary:
            return SynthColor.neutral50
        case .secondary, .tertiary:
            return SynthColor.brandPink500
        case .ghost:
            return SynthColor.neutral600
        case .disabled:
            return SynthColor.stateDisabledText
        }
    }
}
