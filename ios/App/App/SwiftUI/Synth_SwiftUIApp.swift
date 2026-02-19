//
//  Synth_SwiftUIApp.swift
//  Synth
//
//  Native SwiftUI app: auth → onboarding → main shell.
//

import SwiftUI
import SynthNative

@main
struct Synth_SwiftUIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Root view: auth (if needed) → onboarding → main app shell.
struct RootView: View {
    @AppStorage("synth_onboarding_complete") private var onboardingComplete = false
    @State private var showOnboarding = true
    @State private var userId: String?
    @State private var userName: String = "User"
    @State private var isCheckingAuth = true

    var body: some View {
        Group {
            if isCheckingAuth {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(SynthColor.neutral50)
            } else if let uid = userId {
                if showOnboarding {
                    OnboardingCoordinator(
                        userId: uid,
                        userName: userName,
                        onComplete: {
                            onboardingComplete = true
                            showOnboarding = false
                            },
                            onExitToAuth: {
                                Task {
                                    try? await AuthService.signOut()
                                    await refreshAuth()
                                    }
                                }
                            )
                } else {
                    ContentView()
                }
            } else {
                AuthView(onSignedIn: { Task { await refreshAuth() } })
            }
        }
        .task {
            await refreshAuth()
        }
        .onChange(of: onboardingComplete) { _, complete in
            if complete { showOnboarding = false }
        }
    }

    private func refreshAuth() async {
        isCheckingAuth = true
        defer { isCheckingAuth = false }

        let uid = await AuthService.currentUserId()
        let name = await AuthService.currentUserName()
        let completed = uid == nil ? false : await AuthService.onboardingCompleted(userId: uid!)

        await MainActor.run {
            userId = uid
            userName = name

        if uid != nil {
            onboardingComplete = completed
            showOnboarding = !completed
        } else {
            showOnboarding = true
        }
        }
    }
}
