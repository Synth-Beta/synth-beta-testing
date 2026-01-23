import SwiftUI

struct DesignSystemPreview: View {
    @State private var menuOpen: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            SynthHeaderContainer(
                centerContent: { Text("Design System").synth(.h2) },
                trailingContent: {
                    SynthHeaderTrailingMenuButton(menuOpen: menuOpen) {
                        menuOpen.toggle()
                    }
                }
            )

            ScrollView {
                VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                    typographySection
                    buttonsSection
                    emptyStateSection
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)
                .padding(.top, SynthSpacing.small)
                .padding(.bottom, SynthSizes.bottomNavHeight)
            }
            .scrollBounceBehavior(.always)
            .scrollIndicators(.visible)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(SynthColor.neutral50)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SynthColor.neutral50)
        .overlay(alignment: .bottom) {
            BottomNav(
                items: [
                    BottomNavItem(icon: .home, selectedIcon: .houseSelected, label: "Home"),
                    BottomNavItem(icon: .compass, selectedIcon: .discoverSelected, label: "Discover"),
                    BottomNavItem(icon: .plus, label: "Create", isCTA: true),
                    BottomNavItem(icon: .messageCircle, selectedIcon: .circleCommentSelected, label: "Chat"),
                    BottomNavItem(icon: .user, selectedIcon: .userSelected, label: "Profile")
                ],
                activeIndex: 0
            )
        }
    }

    private var typographySection: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.small) {
            Text("H1 Heading").synth(.h1)
            Text("H2 Heading").synth(.h2)
            Text("Body text example").synth(.body)
            Text("Accent text example").synth(.accent)
            Text("Meta text example").synth(.meta)
            Text("Steps text example").synth(.steps)
        }
    }

    private var buttonsSection: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.small) {
            SynthButton("Primary Button", variant: .primary)
            SynthButton("Secondary Button", variant: .secondary)
            SynthButton("Tertiary Chip", variant: .tertiary)
            SynthButton("Ghost Button", variant: .ghost)
            SynthButton("Disabled Button", variant: .disabled)
            SynthButton("Full Width Button", variant: .primary, fullWidth: true)
            SynthButton(icon: .settings, variant: .secondary)
        }
    }

    private var emptyStateSection: some View {
        VStack(alignment: .center, spacing: SynthSpacing.small) {
            EmptyState(
                icon: .music,
                heading: "No events yet",
                description: "Check back later for upcoming events"
            )
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    DesignSystemPreview()
}
