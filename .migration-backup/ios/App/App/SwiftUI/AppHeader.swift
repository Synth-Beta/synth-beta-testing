import SwiftUI

// MARK: - Header Core

struct SynthHeaderContainer<CenterContent: View>: View {
    let centerContent: CenterContent
    let trailingContent: AnyView?
    let alignCenterLeft: Bool

    @State private var safeAreaTop: CGFloat = 0

    // Desired layout:
    // Safe area (minimal, device-defined) + 68 header
    // 68 = 12 top + 44 controls + 12 bottom
    private let headerHeight: CGFloat = SynthSizes.headerContentHeight + (SynthSpacing.small * 2)

    init(
        alignCenterLeft: Bool = false,
        @ViewBuilder centerContent: () -> CenterContent
    ) {
        self.alignCenterLeft = alignCenterLeft
        self.centerContent = centerContent()
        self.trailingContent = nil
    }

    init<TrailingContent: View>(
        alignCenterLeft: Bool = false,
        @ViewBuilder centerContent: () -> CenterContent,
        @ViewBuilder trailingContent: () -> TrailingContent
    ) {
        self.alignCenterLeft = alignCenterLeft
        self.centerContent = centerContent()
        self.trailingContent = AnyView(trailingContent())
    }

    init<TrailingContent: View>(
        alignCenterLeft: Bool = false,
        @ViewBuilder centerContent: () -> CenterContent,
        @ViewBuilder trailingContent: () -> TrailingContent?
    ) {
        self.alignCenterLeft = alignCenterLeft
        self.centerContent = centerContent()
        if let view = trailingContent() {
            self.trailingContent = AnyView(view)
        } else {
            self.trailingContent = nil
        }
    }

    // Reserve space so centered content doesn't get overlapped by the trailing button
    private var rightPadding: CGFloat {
        SynthSizes.inputHeight + SynthSpacing.screenMarginX
    }

    var body: some View {
        let totalHeight = safeAreaTop + headerHeight

        VStack(spacing: 0) {
            // Safe area spacer (minimal, so content never overlaps notch/time/battery)
            Color.clear
                .frame(height: safeAreaTop)

            // Actual header area (fixed 68)
            ZStack {
                // Center content area
                HStack(spacing: 0) {
                    if alignCenterLeft {
                        centerContent
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        Spacer(minLength: 0)
                        centerContent
                        Spacer(minLength: 0)
                    }
                }
                .padding(.leading, SynthSpacing.screenMarginX)
                .padding(.trailing, rightPadding)
                .frame(height: SynthSizes.headerContentHeight)

                // Trailing button area (44x44 touch target)
                if let trailingContent {
                    HStack {
                        Spacer(minLength: 0)
                        trailingContent
                            .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
                            .contentShape(Rectangle())
                            .padding(.trailing, SynthSpacing.screenMarginX)
                    }
                }
            }
            .padding(.vertical, SynthSpacing.small) // 12 top + 12 bottom
            .frame(height: headerHeight)
        }
        .frame(height: totalHeight, alignment: .top)
        .frame(maxWidth: .infinity)
        .background(SynthColor.neutral50)
        .shadow(color: SynthShadow.color, radius: SynthShadow.radius, x: SynthShadow.x, y: SynthShadow.y)
        .ignoresSafeArea(.container, edges: .top) // background fills behind the notch
        .zIndex(10)
        .background(
            GeometryReader { proxy in
                Color.clear
                    .onAppear { safeAreaTop = proxy.safeAreaInsets.top }
                    .onChange(of: proxy.safeAreaInsets.top) { _, newValue in
                        safeAreaTop = newValue
                    }
            }
        )
    }
}

struct AppHeader<CenterContent: View, TrailingContent: View>: View {
    let alignCenterLeft: Bool
    let centerContent: CenterContent
    let trailingContent: TrailingContent

    init(
        alignCenterLeft: Bool = false,
        @ViewBuilder center: () -> CenterContent,
        @ViewBuilder trailing: () -> TrailingContent = { EmptyView() }
    ) {
        self.alignCenterLeft = alignCenterLeft
        self.centerContent = center()
        self.trailingContent = trailing()
    }

    init(
        @ViewBuilder center: () -> CenterContent,
        @ViewBuilder trailing: () -> TrailingContent = { EmptyView() }
    ) {
        self.alignCenterLeft = false
        self.centerContent = center()
        self.trailingContent = trailing()
    }

    var body: some View {
        SynthHeaderContainer(
            alignCenterLeft: alignCenterLeft,
            centerContent: { centerContent },
            trailingContent: { trailingContent }
        )
    }
}

struct AppHeaderOverlay<Content: View, CenterContent: View, TrailingContent: View>: View {
    let showHeader: Bool
    let alignCenterLeft: Bool
    let content: Content
    let centerContent: CenterContent
    let trailingContent: TrailingContent

    // 68 = 12 + 44 + 12, safe area handled inside header itself
    private let headerHeight: CGFloat = SynthSizes.headerContentHeight + (SynthSpacing.small * 2)

    init(
        showHeader: Bool = true,
        alignCenterLeft: Bool = false,
        @ViewBuilder content: () -> Content,
        @ViewBuilder center: () -> CenterContent,
        @ViewBuilder trailing: () -> TrailingContent = { EmptyView() }
    ) {
        self.showHeader = showHeader
        self.alignCenterLeft = alignCenterLeft
        self.content = content()
        self.centerContent = center()
        self.trailingContent = trailing()
    }

    var body: some View {
        ZStack(alignment: .top) {
            content
                // Only offset by the fixed header height.
                // Safe area top is already accounted for inside SynthHeaderContainer.
                .padding(.top, showHeader ? headerHeight : 0)

            if showHeader {
                AppHeader(
                    alignCenterLeft: alignCenterLeft,
                    center: { centerContent },
                    trailing: { trailingContent }
                )
            }
        }
    }
}

// MARK: - Header Variants

struct SynthHeaderTitle: View {
    let title: String

    var body: some View {
        SynthHeaderContainer(centerContent: {
            Text(title).synth(.h2)
        })
    }
}

struct SynthHeaderSearch: View {
    @Binding var text: String
    var placeholder: String = "Search…"
    var showsClearButton: Bool = true
    var onSubmit: ((String) -> Void)?
    var onClear: (() -> Void)?
    var onFocusChange: ((Bool) -> Void)?

    var body: some View {
        SynthHeaderContainer(centerContent: {
            SynthSearchBar(
                text: $text,
                placeholder: placeholder,
                widthVariant: .flex,
                showsClearButton: showsClearButton,
                onSubmit: onSubmit,
                onClear: onClear,
                onFocusChange: onFocusChange
            )
            .frame(maxWidth: .infinity)
        })
    }
}

struct SynthHeaderLeadingControl<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        SynthHeaderContainer(alignCenterLeft: true, centerContent: {
            content
        })
    }
}

struct SynthHeaderTrailingMenuButton: View {
    let menuOpen: Bool
    var onTap: (() -> Void)?

    var body: some View {
        Button(action: { onTap?() }) {
            IconView(
                menuOpen ? .x : .menu,
                size: SynthSizes.iconStandard,
                color: SynthColor.neutral900
            )
            .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight) // 44x44 touch target
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(menuOpen ? "Close menu" : "Open menu")
        .accessibilityValue(menuOpen ? "Expanded" : "Collapsed")
        .accessibilityAddTraits(.isButton)
    }
}

struct SynthHeaderDropdownOption: Identifiable, Hashable {
    let id: String
    let title: String
}

struct SynthHeaderDropdown: View {
    var title: String? = nil
    @Binding var selection: SynthHeaderDropdownOption
    var options: [SynthHeaderDropdownOption]
    var onSelect: ((SynthHeaderDropdownOption) -> Void)?

    @State private var isOpen: Bool = false

    private var borderColor: Color {
        isOpen ? SynthColor.brandPink500 : SynthColor.neutral200
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.inline) {
            if let title {
                Text(title).synth(.meta, color: SynthColor.neutral600)
            }

            Button(action: { isOpen.toggle() }) {
                HStack(spacing: SynthSpacing.inline) {
                    Text(selection.title)
                        .synth(.meta, color: SynthColor.neutral900)

                    IconView(.chevronDown, size: SynthSizes.iconSmall, color: SynthColor.neutral900)
                }
                .padding(.horizontal, SynthSpacing.small)
                .frame(height: SynthSizes.inputHeight) // 44px height (not 36)
                .background(SynthColor.neutral50)
                .overlay(
                    RoundedRectangle(cornerRadius: SynthRadius.corner)
                        .stroke(borderColor, lineWidth: 2)
                )
                .clipShape(RoundedRectangle(cornerRadius: SynthRadius.corner))
            }
            .buttonStyle(.plain)
            .frame(minHeight: SynthSizes.inputHeight, alignment: .leading)
            .contentShape(Rectangle())
            .popover(isPresented: $isOpen, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
                dropdownMenu
                    .presentationCompactAdaptation(.popover)
            }
        }
    }

    private var dropdownMenu: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(options) { option in
                Button(action: {
                    selection = option
                    onSelect?(option)
                    isOpen = false
                }) {
                    Text(option.title)
                        .synth(.meta, color: SynthColor.neutral900)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(SynthSpacing.small)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(SynthSpacing.inline)
        .frame(minWidth: SynthSizes.dropdownMinWidth)
        .background(SynthColor.neutral50)
        .overlay(
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(SynthColor.neutral200, lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: SynthRadius.corner))
        .shadow(color: SynthShadow.color, radius: SynthShadow.radius, x: SynthShadow.x, y: SynthShadow.y)
    }
}

// MARK: - Modal Header

struct SynthModalHeader: View {
    let title: String
    var onClose: (() -> Void)?

    var body: some View {
        HStack(spacing: 0) {
            Text(title).synth(.h2)
            Spacer(minLength: 0)
            Button(action: { onClose?() }) {
                IconView(.x, size: SynthSizes.iconStandard, color: SynthColor.neutral900)
                    .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
        .frame(height: SynthSizes.inputHeight)
        .padding(.horizontal, SynthSpacing.screenMarginX)
        .background(SynthColor.neutral50)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(SynthColor.neutral200)
                .frame(height: SynthSizes.borderThin)
        }
    }
}

struct HomeFeedHeader: View {
    @Binding var query: String

    var body: some View {
        VStack(spacing: 0) {
            SynthSearchBar(
                text: $query,
                placeholder: "Search events, artists, venues",
                widthVariant: .full
            )
            .padding(.horizontal, SynthSpacing.screenMarginX)
            .padding(.vertical, SynthSpacing.small)
        }
        .background(SynthColor.neutral50)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(SynthColor.neutral100)
                .frame(height: 1)
        }
    }
}

