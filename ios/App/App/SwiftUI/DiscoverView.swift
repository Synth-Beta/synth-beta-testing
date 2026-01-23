import SwiftUI

struct DiscoverView: View {
    let title: String
    let titleStyle: SynthTextStyle
    let description: String
    let hideHeader: Bool

    @State private var searchQuery: String = ""
    @Binding var menuOpen: Bool

    init(
        title: String,
        titleStyle: SynthTextStyle,
        description: String,
        hideHeader: Bool = false,
        menuOpen: Binding<Bool> = .constant(false)
    ) {
        self.title = title
        self.titleStyle = titleStyle
        self.description = description
        self.hideHeader = hideHeader
        self._menuOpen = menuOpen
    }

    var body: some View {
        if hideHeader {
            VStack(spacing: 0) {
                SynthSearchBar(
                    text: $searchQuery,
                    placeholder: "Try \"Radiohead\"",
                    widthVariant: .full
                )
                .padding(.horizontal, SynthSpacing.screenMarginX)
                .safeAreaPadding(.top, SynthSpacing.small)

                PageBody(
                    title: title,
                    titleStyle: titleStyle,
                    description: description,
                    showsAllPagesButton: false,
                    onShowAllPages: nil,
                    hideHeader: true,
                    topPadding: SynthSpacing.small
                )
            }
            .background(SynthColor.neutral50)
        } else {
            AppHeaderOverlay(
                showHeader: true,
                content: {
                    PageBody(
                        title: title,
                        titleStyle: titleStyle,
                        description: description,
                        showsAllPagesButton: false,
                        onShowAllPages: nil,
                        hideHeader: false,
                        topPadding: SynthSpacing.small
                    )
                },
                center: {
                    SynthSearchBar(
                        text: $searchQuery,
                        placeholder: "Try \"Radiohead\"",
                        widthVariant: .flex
                    )
                    .frame(maxWidth: .infinity)
                },
                trailing: {
                    SynthHeaderTrailingMenuButton(menuOpen: menuOpen) {
                        menuOpen.toggle()
                    }
                }
            )
            .background(SynthColor.neutral50)
        }
    }
}
