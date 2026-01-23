import SwiftUI

struct BottomNavItem: Identifiable {
    let id = UUID()
    let icon: Icon
    let selectedIcon: Icon?
    let label: String
    let isCTA: Bool

    init(icon: Icon, selectedIcon: Icon? = nil, label: String, isCTA: Bool = false) {
        self.icon = icon
        self.selectedIcon = selectedIcon
        self.label = label
        self.isCTA = isCTA
    }
}

struct BottomNav: View {
    let items: [BottomNavItem]
    let activeIndex: Int
    let onSelect: (Int) -> Void

    private let barHeight: CGFloat = SynthSizes.bottomNavHeight           // 80
    private let iconSize: CGFloat = SynthSizes.iconStandard               // 24
    private let ctaWidth: CGFloat = SynthSizes.bottomNavCTAWidth          // 70
    private let ctaHeight: CGFloat = SynthSizes.bottomNavCTAHeight        // 40
    private let borderWidth: CGFloat = SynthSizes.bottomNavBorderWidth    // 2

    private let horizontalMargin: CGFloat = SynthSpacing.screenMarginX    // 20
    private let verticalPadding: CGFloat = SynthSpacing.bottomNavPaddingY // 20

    private let touchTargetSize: CGFloat = SynthSizes.inputHeight         // 44

    init(
        items: [BottomNavItem],
        activeIndex: Int,
        onSelect: @escaping (Int) -> Void = { _ in }
    ) {
        self.items = items
        self.activeIndex = activeIndex
        self.onSelect = onSelect
    }

    var body: some View {
        GeometryReader { proxy in
            let availableWidth = proxy.size.width - (horizontalMargin * 2)
            let iconSpacing = max(
                0,
                (availableWidth - (4 * touchTargetSize) - ctaWidth) / 4
            )

            ZStack {
                TopRoundedRectangle(radius: SynthRadius.corner)
                    .fill(SynthColor.brandPink050)
                    .overlay(alignment: .top) {
                        TopBorder(radius: SynthRadius.corner)
                            .stroke(SynthColor.neutral200, lineWidth: borderWidth)
                    }

                HStack(alignment: .center, spacing: iconSpacing) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        if item.isCTA {
                            ctaButton(index: index, label: item.label)
                        } else {
                            navButton(index: index, item: item)
                        }
                    }
                }
                .padding(.horizontal, horizontalMargin)
                .padding(.vertical, verticalPadding)
            }
            .frame(height: barHeight)
            .frame(maxWidth: .infinity)
        }
        .frame(height: barHeight)
        .frame(maxWidth: .infinity)
        .background(SynthColor.brandPink050.ignoresSafeArea(.container, edges: .bottom))
    }

    private func navButton(index: Int, item: BottomNavItem) -> some View {
        let isSelected = (index == activeIndex)
        let iconToShow = isSelected ? (item.selectedIcon ?? item.icon) : item.icon

        // Use Synth pink for all non-CTA icons.
        let iconColor = SynthColor.brandPink500
        let preserveOriginalColors = isSelected && item.selectedIcon != nil
        return Button(action: { onSelect(index) }) {
            ZStack {
                Color.clear
                    .frame(width: touchTargetSize, height: touchTargetSize)

                IconView(
                    iconToShow,
                    size: iconSize,
                    color: iconColor,
                    preserveOriginalColors: preserveOriginalColors
                )
                .frame(width: iconSize, height: iconSize)
            }
            .frame(width: touchTargetSize, height: touchTargetSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
    }

    private func ctaButton(index: Int, label: String) -> some View {
        Button(action: { onSelect(index) }) {
            ZStack {
                // 44x44 touch target
                Color.clear
                    .frame(width: touchTargetSize, height: touchTargetSize)

                // CTA visual pill 70x40
                IconView(.plus, size: iconSize, color: SynthColor.neutral50)
                    .frame(width: ctaWidth, height: ctaHeight)
                    .background(SynthColor.brandPink500)
                    .clipShape(Capsule())
            }
            .frame(width: touchTargetSize, height: touchTargetSize)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

}

struct TopRoundedRectangle: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(radius, min(rect.width, rect.height) / 2)
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: r))
        path.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: rect.width - r, y: 0))
        path.addQuadCurve(to: CGPoint(x: rect.width, y: r), control: CGPoint(x: rect.width, y: 0))
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: rect.height))
        return path
    }
}

struct TopBorder: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(radius, min(rect.width, rect.height) / 2)
        var path = Path()
        path.move(to: CGPoint(x: 0, y: r))
        path.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: rect.width - r, y: 0))
        path.addQuadCurve(to: CGPoint(x: rect.width, y: r), control: CGPoint(x: rect.width, y: 0))
        return path
    }
}

