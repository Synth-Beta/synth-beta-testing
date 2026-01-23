import SwiftUI

struct HeaderShowcase: View {
    @State private var searchText: String = ""
    @State private var menuOpen: Bool = false
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

    var body: some View {
        ScrollView {
            VStack(spacing: SynthSpacing.grouped) {
                VStack(spacing: 0) {
                    SynthHeaderTitle(title: "Profile")
                    Spacer().frame(height: SynthSpacing.small)
                }

                VStack(spacing: 0) {
                    SynthHeaderContainer(
                        centerContent: { Text("Menu Closed").synth(.h2) },
                        trailingContent: { SynthHeaderTrailingMenuButton(menuOpen: false) }
                    )
                    Spacer().frame(height: SynthSpacing.small)
                }

                VStack(spacing: 0) {
                    SynthHeaderContainer(
                        centerContent: { Text("Menu Open").synth(.h2) },
                        trailingContent: { SynthHeaderTrailingMenuButton(menuOpen: true) }
                    )
                    Spacer().frame(height: SynthSpacing.small)
                }

                VStack(spacing: 0) {
                    SynthHeaderSearch(text: $searchText, placeholder: "Try \"Radiohead\"")
                    Spacer().frame(height: SynthSpacing.small)
                }

                VStack(spacing: 0) {
                    SynthHeaderLeadingControl {
                        SynthHeaderDropdown(
                            selection: $selectedFeedType,
                            options: feedOptions
                        )
                    }
                    Spacer().frame(height: SynthSpacing.small)
                }

                VStack(spacing: 0) {
                    SynthModalHeader(title: "Modal Title")
                    Spacer().frame(height: SynthSpacing.small)
                }
            }
            .padding(.horizontal, SynthSpacing.screenMarginX)
            .padding(.vertical, SynthSpacing.grouped)
        }
        .background(SynthColor.neutral50)
    }
}
