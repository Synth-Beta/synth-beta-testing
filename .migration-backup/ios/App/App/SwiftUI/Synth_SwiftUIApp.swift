//
//  Synth_SwiftUIApp.swift
//  Synth
//
//  Native SwiftUI app: auth → onboarding → main shell.
//

import SwiftUI
import SynthNative

enum AuthFlow: String {
    case signIn = "signin"
    case signUp = "signup"

    static let storageKey = "synth_auth_flow"
    static var defaultFlow: AuthFlow { .signIn }
}

@main
struct Synth_SwiftUIApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Root view: onboarding (if needed for native-auth users) → main app shell.
///
/// Auth is handled entirely by the React/Capacitor web layer (the pink login page).
/// This native shell only intercepts to show the native OnboardingCoordinator when
/// a user has an existing native Supabase session but hasn't completed onboarding.
/// All other states — including unauthenticated — fall through to ContentView so
/// the React app can handle login and its own onboarding flow uninterrupted.
struct RootView: View {
    @AppStorage("synth_onboarding_complete") private var onboardingComplete = false
    @AppStorage(AuthFlow.storageKey) private var authFlowRawValue = AuthFlow.defaultFlow.rawValue
    @State private var showOnboarding = false
    @State private var userId: String?
    @State private var userName: String = "User"
    @State private var isCheckingAuth = true
    @StateObject private var authModel = AppAuthModel.shared

    private var currentAuthFlow: AuthFlow {
        AuthFlow(rawValue: authFlowRawValue) ?? .defaultFlow
    }

    var body: some View {
        Group {
            if isCheckingAuth {
                ProgressView("Loading...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(SynthColor.neutral50)
            } else if userId == nil {
                AuthView(onSignedIn: {
                    Task { await refreshAuth() }
                })
            } else if let uid = userId {
                if showOnboarding {
                    OnboardingCoordinator(
                        userId: uid,
                        userName: userName,
                        onComplete: {
                            onboardingComplete = true
                            showOnboarding = false
                            authFlowRawValue = AuthFlow.defaultFlow.rawValue
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
                // This branch should never hit but keeps the view hierarchy complete.
                ContentView()
            }
        }
        .environmentObject(authModel)
        .task {
            await refreshAuth()
        }
        .onChange(of: onboardingComplete) { _, complete in
            if complete { showOnboarding = false }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("SynthAuthDidChange"))) { _ in
            Task {
                await refreshAuth()
            }
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
                showOnboarding = (uid != nil) && !completed
                authFlowRawValue = AuthFlow.defaultFlow.rawValue
            } else {
                onboardingComplete = false
                showOnboarding = false
                authFlowRawValue = AuthFlow.defaultFlow.rawValue
            }
        }
    }
}
