import SwiftUI

struct MenuCategory: View {
    let label: String
    let icon: Icon
    var onPress: (() -> Void)? = nil

    var body: some View {
        let content = HStack(spacing: 0) {
            IconText(
                text: label,
                icon: icon,
                iconPosition: .left,
                iconColor: SynthColor.neutral600,
                textColor: SynthColor.neutral900
            )
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, SynthSpacing.screenMarginX)
        .padding(.vertical, SynthSpacing.menuCategoryPaddingY)
        .frame(height: SynthSizes.menuItemRowHeight, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .leading)

        if let onPress {
            Button(action: onPress) {
                content
            }
            .buttonStyle(.plain)
        } else {
            content
        }
    }
}
