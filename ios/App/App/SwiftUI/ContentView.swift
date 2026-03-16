//
//  ContentView.swift
//  Synth
//
//  After native auth/onboarding, shows the full Capacitor web app.
//

import SwiftUI
import SynthNative

struct ContentView: View {
    @StateObject private var headerModel = NativeEventHeaderModel.shared
    @State private var activeTab: Int = 0

    var body: some View {
        ZStack(alignment: .top) {
            CapacitorWebView()
                .ignoresSafeArea(.all)

            if headerModel.isVisible {
                NativeEventHeaderView(title: headerModel.title)
                    .zIndex(9999)
            }
            
            VStack {
                Spacer()
                BottomNav(
                    items: [
                        BottomNavItem(icon: .home, selectedIcon: .houseSelected, label: "Home"),
                        BottomNavItem(icon: .compass, selectedIcon: .discoverSelected, label: "Discover"),
                        BottomNavItem(icon: .plus, label: "Create", isCTA: true),
                        BottomNavItem(icon: .messageCircle, selectedIcon: .circleCommentSelected, label: "Chat"),
                        BottomNavItem(icon: .user, selectedIcon: .userSelected, label: "Profile")
                    ],
                    activeIndex: activeTab,
                    onSelect: { index in
                        activeTab = index
                        SynthDeepLinkRouter.shared.notifyTabSelected(index: index)
                    }
                )
            }
            .zIndex(100)
        }
        .preferredColorScheme(.light) // makes status bar content black
    }
}

#Preview {
    ContentView()
}