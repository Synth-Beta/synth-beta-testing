import SwiftUI

struct PageBody: View {
    let title: String
    let titleStyle: SynthTextStyle
    let description: String
    let showsAllPagesButton: Bool
    let onShowAllPages: (() -> Void)?
    let hideHeader: Bool
    let topPadding: CGFloat

    init(
        title: String,
        titleStyle: SynthTextStyle,
        description: String,
        showsAllPagesButton: Bool,
        onShowAllPages: (() -> Void)?,
        hideHeader: Bool,
        topPadding: CGFloat = SynthSpacing.small
    ) {
        self.title = title
        self.titleStyle = titleStyle
        self.description = description
        self.showsAllPagesButton = showsAllPagesButton
        self.onShowAllPages = onShowAllPages
        self.hideHeader = hideHeader
        self.topPadding = topPadding
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SynthSpacing.small) {
                if showsAllPagesButton {
                    Button(action: { onShowAllPages?() }) {
                        Text("All Pages")
                            .synth(.meta, color: SynthColor.brandPink500)
                    }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Text(title).synth(titleStyle)
                Text("Coming soon!").synth(.body)
                Text(description).synth(.meta, color: SynthColor.neutral600)
            }
            .padding(.horizontal, SynthSpacing.screenMarginX)
            .padding(.top, hideHeader ? SynthSpacing.small : topPadding)
            .padding(.bottom, SynthSpacing.bottomNav)
        }
        .background(SynthColor.neutral50)
    }
}
