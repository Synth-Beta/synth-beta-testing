import SwiftUI

struct HomeFeedView: View {
    let title: String
    let titleStyle: SynthTextStyle
    let description: String
    let hideHeader: Bool

    @State private var searchQuery: String = ""
    @Binding var menuOpen: Bool
    @State private var selectedFeedType: SynthHeaderDropdownOption = SynthHeaderDropdownOption(
        id: "recommended",
        title: "Hand Picked Events"
    )

    private let feedOptions: [SynthHeaderDropdownOption] = [
        SynthHeaderDropdownOption(id: "recommended", title: "Hand Picked Events"),
        SynthHeaderDropdownOption(id: "trending", title: "Trending Events"),
        SynthHeaderDropdownOption(id: "friends", title: "Friends Interested"),
        SynthHeaderDropdownOption(id: "group-chats", title: "Recommended Group Chats"),
        SynthHeaderDropdownOption(id: "reviews", title: "Reviews")
    ]

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
        AppHeaderOverlay(
            showHeader: !hideHeader,
            alignCenterLeft: true,
            content: {
                PageBody(
                    title: title,
                    titleStyle: titleStyle,
                    description: description,
                    showsAllPagesButton: false,
                    onShowAllPages: nil,
                    hideHeader: hideHeader,
                    topPadding: SynthSpacing.small
                )
            },
            center: {
                SynthHeaderDropdown(
                    selection: $selectedFeedType,
                    options: feedOptions
                )
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
