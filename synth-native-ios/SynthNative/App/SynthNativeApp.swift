//
//  SynthNativeApp.swift
//  SynthNative
//
//  Root view for the Synth native app. Use as the root of your WindowGroup
//  when creating an Xcode project. Integrate with Supabase Auth to pass
//  real userId and userName after sign-in.
//

import SwiftUI

struct SynthNativeApp: View {
    @State private var showOnboarding = true
    let userId: String
    let userName: String

    init(userId: String = "00000000-0000-0000-0000-000000000001", userName: String = "User") {
        self.userId = userId
        self.userName = userName
    }

    var body: some View {
        if showOnboarding {
            OnboardingCoordinator(
                userId: userId,
                userName: userName,
                onComplete: {
                    showOnboarding = false
                }
            )
        } else {
            Text("Welcome! Onboarding complete.")
                .font(SynthFont.font(size: SynthTypography.h1.size, weight: SynthTypography.h1.weight))
        }
    }
}
