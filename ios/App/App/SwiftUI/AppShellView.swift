import SwiftUI

struct AppShellView: View {
    @State private var path = NavigationPath()
    @State private var selectedTab: AppTab = .home
    @State private var activeModal: AppModal?
    @State private var menuOpen: Bool = false

    var body: some View {
        ZStack {
            NavigationStack(path: $path) {
                currentTabView()
                    .navigationDestination(for: AppDestination.self) { destination in
                        destinationView(for: destination)
                    }
                    .safeAreaInset(edge: .bottom, spacing: 0) {
                        BottomNav(
                            items: bottomNavItems,
                            activeIndex: selectedTab.rawValue,
                            onSelect: handleTabSelection
                        )
                        .ignoresSafeArea(.keyboard, edges: .bottom)
                    }
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $activeModal) { modal in
                modalView(for: modal)
            }

            SideMenuView(
                isOpen: $menuOpen,
                userName: "User",
                username: "synth",
                initial: "S",
                menuItems: sideMenuItems,
                onLogout: handleLogout,
                verificationData: verificationData
            )
        }
    }

    private var bottomNavItems: [BottomNavItem] {
        [
            BottomNavItem(icon: .home, selectedIcon: .houseSelected, label: "Home"),
            BottomNavItem(icon: .compass, selectedIcon: .discoverSelected, label: "Discover"),
            BottomNavItem(icon: .plus, label: "Create", isCTA: true),
            BottomNavItem(icon: .messageCircle, selectedIcon: .circleCommentSelected, label: "Chat"),
            BottomNavItem(icon: .user, selectedIcon: .userSelected, label: "Profile")
        ]
    }

    private func handleTabSelection(_ index: Int) {
        guard let tab = AppTab(rawValue: index) else { return }
        if tab == .create {
            activeModal = .eventReview
            return
        }
        selectedTab = tab
    }

    private func currentTabView() -> some View {
        switch selectedTab {
        case .home:
            return AnyView(
                HomeFeedView(
                    title: "Home Feed",
                    titleStyle: .h1,
                    description: "Your personalized feed with recommended, trending, friends interested, reviews, and group chat discovery.",
                    menuOpen: $menuOpen
                )
            )
        case .discover:
            return AnyView(
                DiscoverView(
                    title: "Discover",
                    titleStyle: .h1,
                    description: "Unified search, filters, map, and list discovery for events, artists, venues, and users.",
                    menuOpen: $menuOpen
                )
            )
        case .chat:
            return AnyView(
                PageScreen(
                    title: "Chat",
                    titleStyle: .h1,
                    description: "Direct messages and group chats.",
                    showsAllPagesButton: isDebug,
                    onShowAllPages: { path.append(AppDestination.allPages) },
                    menuOpen: $menuOpen
                )
            )
        case .profile:
            return AnyView(
                PageScreen(
                    title: "Profile",
                    titleStyle: .h1,
                    description: "Your profile, tabs, and navigation to followers and events.",
                    menuOpen: $menuOpen
                )
            )
        case .create:
            return AnyView(EmptyView())
        }
    }

    private func destinationView(for destination: AppDestination) -> some View {
        switch destination {
        case .homeFeed:
            return AnyView(PageScreen(title: "Home Feed", titleStyle: .h1, description: "Your personalized feed with recommended, trending, friends interested, reviews, and group chat discovery.", menuOpen: $menuOpen))
        case .discover:
            return AnyView(PageScreen(title: "Discover", titleStyle: .h1, description: "Unified search, filters, map, and list discovery for events, artists, venues, and users.", menuOpen: $menuOpen))
        case .chat:
            return AnyView(PageScreen(title: "Chat", titleStyle: .h1, description: "Direct messages and group chats.", menuOpen: $menuOpen))
        case .profile:
            return AnyView(PageScreen(title: "Profile", titleStyle: .h1, description: "Your profile, tabs, and navigation to followers and events.", menuOpen: $menuOpen))
        case .auth:
            return AnyView(PageScreen(title: "Auth", titleStyle: .h2, description: "Sign in and account access.", menuOpen: $menuOpen))
        case .notifications:
            return AnyView(PageScreen(title: "Notifications", titleStyle: .h2, description: "Your latest alerts and updates.", menuOpen: $menuOpen))
        case .profileEdit:
            return AnyView(PageScreen(title: "Profile Edit", titleStyle: .h2, description: "Edit your profile details, bio, and preferences.", menuOpen: $menuOpen))
        case .streamingStats:
            return AnyView(PageScreen(title: "Streaming Stats", titleStyle: .h2, description: "Your streaming insights and stats.", menuOpen: $menuOpen))
        case .spotifyCallback:
            return AnyView(PageScreen(title: "Spotify Callback", titleStyle: .h2, description: "OAuth callback for Spotify connection.", menuOpen: $menuOpen))
        case .artistEvents:
            return AnyView(PageScreen(title: "Artist Events", titleStyle: .h2, description: "Events for a selected artist.", menuOpen: $menuOpen))
        case .venueEvents:
            return AnyView(PageScreen(title: "Venue Events", titleStyle: .h2, description: "Events for a selected venue.", menuOpen: $menuOpen))
        case .artistVenueFollowing:
            return AnyView(PageScreen(title: "Artist/Venue Following", titleStyle: .h2, description: "Artists and venues you follow.", menuOpen: $menuOpen))
        case .creatorAnalytics:
            return AnyView(PageScreen(title: "Creator Analytics", titleStyle: .h2, description: "Creator dashboard and metrics.", menuOpen: $menuOpen))
        case .businessAnalytics:
            return AnyView(PageScreen(title: "Business Analytics", titleStyle: .h2, description: "Business dashboard and performance.", menuOpen: $menuOpen))
        case .adminAnalytics:
            return AnyView(PageScreen(title: "Admin Analytics", titleStyle: .h2, description: "Admin dashboard and system metrics.", menuOpen: $menuOpen))
        case .eventsManagement:
            return AnyView(PageScreen(title: "Events Management", titleStyle: .h2, description: "Manage your events and promotions.", menuOpen: $menuOpen))
        case .onboardingFlow:
            return AnyView(PageScreen(title: "Onboarding Flow", titleStyle: .h2, description: "Account setup and onboarding steps.", menuOpen: $menuOpen))
        case .onboardingTour:
            return AnyView(PageScreen(title: "Onboarding Tour", titleStyle: .h2, description: "Guided tour for first‑time users.", menuOpen: $menuOpen))
        case .admin:
            return AnyView(PageScreen(title: "Admin", titleStyle: .h2, description: "Admin panel entry point.", menuOpen: $menuOpen))
        case .allPages:
            return AnyView(
                AllPagesView(
                    sections: allPagesSections,
                    onSelectDestination: { path.append($0) },
                    onSelectModal: { activeModal = $0 },
                    menuOpen: $menuOpen
                )
            )
        }
    }

    private func modalView(for modal: AppModal) -> some View {
        switch modal {
        case .eventDetails:
            return AnyView(ModalPlaceholderView(title: "Event Details", description: "Event details modal with interest toggle and media."))
        case .eventReview:
            return AnyView(ModalPlaceholderView(title: "Event Review", description: "Create a review for an event."))
        case .settings:
            return AnyView(ModalPlaceholderView(title: "Settings", description: "Settings modal for account and app preferences."))
        case .reviewDetail:
            return AnyView(ModalPlaceholderView(title: "Review Detail", description: "Review detail modal with ratings and comments."))
        }
    }

    private var allPagesSections: [(title: String, pages: [AppPage])] {
        [
            (
                "Core Tabs",
                [
                    AppPage(title: "Home Feed", description: "Personalized feed and discovery sections.", destination: .homeFeed, titleStyle: .h1),
                    AppPage(title: "Discover", description: "Search, filters, and map discovery.", destination: .discover, titleStyle: .h1),
                    AppPage(title: "Chat", description: "Direct and group messaging.", destination: .chat, titleStyle: .h1),
                    AppPage(title: "Profile", description: "User profiles with tabs and navigation.", destination: .profile, titleStyle: .h1),
                    AppPage(title: "Create / Review", description: "Create a review via the review modal.", modal: .eventReview)
                ]
            ),
            (
                "Additional Pages",
                [
                    AppPage(title: "Auth", description: "Sign in and account access.", destination: .auth),
                    AppPage(title: "Notifications", description: "Alerts and updates.", destination: .notifications),
                    AppPage(title: "Profile Edit", description: "Edit profile details.", destination: .profileEdit),
                    AppPage(title: "Streaming Stats", description: "Streaming insights and stats.", destination: .streamingStats),
                    AppPage(title: "Spotify Callback", description: "OAuth callback flow.", destination: .spotifyCallback),
                    AppPage(title: "Artist Events", description: "Events for a selected artist.", destination: .artistEvents),
                    AppPage(title: "Venue Events", description: "Events for a selected venue.", destination: .venueEvents),
                    AppPage(title: "Artist/Venue Following", description: "Artists and venues you follow.", destination: .artistVenueFollowing),
                    AppPage(title: "Events Management", description: "Manage your events.", destination: .eventsManagement),
                    AppPage(title: "Onboarding Flow", description: "Account setup and onboarding steps.", destination: .onboardingFlow),
                    AppPage(title: "Onboarding Tour", description: "Guided tour for first‑time users.", destination: .onboardingTour),
                    AppPage(title: "Admin", description: "Admin panel entry point.", destination: .admin)
                ]
            ),
            (
                "Analytics Dashboards",
                [
                    AppPage(title: "Creator Analytics", description: "Creator dashboard and metrics.", destination: .creatorAnalytics),
                    AppPage(title: "Business Analytics", description: "Business dashboard and performance.", destination: .businessAnalytics),
                    AppPage(title: "Admin Analytics", description: "Admin dashboard and system metrics.", destination: .adminAnalytics)
                ]
            ),
            (
                "Modals",
                [
                    AppPage(title: "Event Details", description: "Event details modal.", modal: .eventDetails),
                    AppPage(title: "Event Review", description: "Create a review for an event.", modal: .eventReview),
                    AppPage(title: "Settings", description: "Settings modal.", modal: .settings),
                    AppPage(title: "Review Detail", description: "Review detail modal.", modal: .reviewDetail)
                ]
            )
        ]
    }

    private var isDebug: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    private var sideMenuItems: [MenuCategoryItem] {
        [
            MenuCategoryItem(label: "Notifications", icon: .bell) {
                menuOpen = false
                path.append(AppDestination.notifications)
            },
            MenuCategoryItem(label: "Event Timeline", icon: .music) {
                menuOpen = false
                selectedTab = .profile
            },
            MenuCategoryItem(label: "Interested", icon: .heart) {
                menuOpen = false
                selectedTab = .profile
            },
            MenuCategoryItem(label: "Settings", icon: .settings) {
                menuOpen = false
                activeModal = .settings
            }
        ]
    }

    private func handleLogout() {
        menuOpen = false
    }

    private var verificationData: VerificationStatusData {
        let criteria = [
            VerificationCriterion(
                label: "Complete Profile",
                description: "Fill out your name, bio, avatar, birthday, and gender",
                target: "100% complete",
                met: false
            ),
            VerificationCriterion(
                label: "Streaming Account",
                description: "Connect your Spotify or Apple Music account",
                target: "Connected",
                met: false
            ),
            VerificationCriterion(
                label: "Event Reviews",
                description: "Share your concert experiences by posting reviews",
                target: "3+ reviews",
                met: false
            ),
            VerificationCriterion(
                label: "Friend Network",
                description: "Build your network by connecting with other users",
                target: "10+ friends",
                met: false
            ),
            VerificationCriterion(
                label: "Event Interests",
                description: "Show interest in concerts you want to attend",
                target: "10+ events",
                met: false
            ),
            VerificationCriterion(
                label: "Account Age",
                description: "Be an active member of the community",
                target: "30+ days",
                met: false
            ),
            VerificationCriterion(
                label: "Email Verified",
                description: "Verify your email address",
                target: "Verified",
                met: true
            ),
            VerificationCriterion(
                label: "Event Attendance",
                description: "Attend and review concerts",
                target: "3+ attended",
                met: false
            )
        ]
        let criteriaMet = criteria.filter { $0.met }.count
        let score = Int((Double(criteriaMet) / Double(max(1, criteria.count))) * 100.0)

        return VerificationStatusData(
            accountType: .user,
            verified: criteriaMet >= 4,
            score: score,
            criteria: criteria
        )
    }
}

struct ModalPlaceholderView: View {
    let title: String
    let description: String

    var body: some View {
        VStack(spacing: 0) {
            SynthModalHeader(title: title)

            VStack(alignment: .leading, spacing: SynthSpacing.small) {
                Text(title).synth(.h2)
                Text("Coming soon!").synth(.body)
                Text(description).synth(.meta, color: SynthColor.neutral600)
            }
            .padding(.horizontal, SynthSpacing.screenMarginX)
            .padding(.top, SynthSpacing.small)
            .padding(.bottom, SynthSpacing.bottomNav)

            Spacer()
        }
        .background(SynthColor.neutral50)
    }
}
