import SwiftUI

struct AllPagesView: View {
    let sections: [(title: String, pages: [AppPage])]
    let onSelectDestination: (AppDestination) -> Void
    let onSelectModal: (AppModal) -> Void
    @Binding var menuOpen: Bool

    var body: some View {
        AppHeaderOverlay(
            showHeader: true,
            content: {
                List {
                    ForEach(sections, id: \.title) { section in
                        Section(section.title) {
                            ForEach(section.pages) { page in
                                Button(action: { select(page) }) {
                                    VStack(alignment: .leading, spacing: SynthSpacing.inline) {
                                        Text(page.title).synth(.body)
                                        Text(page.description).synth(.meta, color: SynthColor.neutral600)
                                    }
                                    .padding(.vertical, SynthSpacing.small)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            },
            center: { Text("All Pages").synth(.h2) },
            trailing: {
                SynthHeaderTrailingMenuButton(menuOpen: menuOpen) {
                    menuOpen.toggle()
                }
            }
        )
        .background(SynthColor.neutral50)
    }

    private func select(_ page: AppPage) {
        if let destination = page.destination {
            onSelectDestination(destination)
        } else if let modal = page.modal {
            onSelectModal(modal)
        }
    }
}
