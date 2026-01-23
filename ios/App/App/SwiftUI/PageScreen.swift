import SwiftUI

struct PageScreen: View {
    let title: String
    let titleStyle: SynthTextStyle
    let description: String
    let showsAllPagesButton: Bool
    let onShowAllPages: (() -> Void)?
    let hideHeader: Bool

    @Binding var menuOpen: Bool

    init(
        title: String,
        titleStyle: SynthTextStyle,
        description: String,
        showsAllPagesButton: Bool = false,
        onShowAllPages: (() -> Void)? = nil,
        hideHeader: Bool = false,
        menuOpen: Binding<Bool> = .constant(false)
    ) {
        self.title = title
        self.titleStyle = titleStyle
        self.description = description
        self.showsAllPagesButton = showsAllPagesButton
        self.onShowAllPages = onShowAllPages
        self.hideHeader = hideHeader
        self._menuOpen = menuOpen
    }

    var body: some View {
        AppHeaderOverlay(
            showHeader: !hideHeader,
            content: {
                PageBody(
                    title: title,
                    titleStyle: titleStyle,
                    description: description,
                    showsAllPagesButton: showsAllPagesButton,
                    onShowAllPages: onShowAllPages,
                    hideHeader: hideHeader,
                    topPadding: SynthSpacing.small
                )
            },
            center: { Text(title).synth(.h2) },
            trailing: {
                SynthHeaderTrailingMenuButton(menuOpen: menuOpen) {
                    menuOpen.toggle()
                }
            }
        )
        .background(SynthColor.neutral50)
    }
}
