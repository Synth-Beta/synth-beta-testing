//
//  OnboardingCoordinator.swift
//  SynthNative
//
//  Page state, navigation, and completion flow.
//

import SwiftUI

public struct OnboardingCoordinator: View {
    @State private var state = OnboardingState()
    @State private var currentPage = 1
    @State private var errorMessage: String?
    @State private var isSaving = false

    public let userId: String
    public let userName: String
    public let onComplete: () -> Void
    public let onExitToAuth: (() -> Void)?

    private let totalPages = 5

    public init(
        userId: String,
        userName: String,
        onComplete: @escaping () -> Void,
        onExitToAuth: (() -> Void)? = nil
) {
        self.userId = userId
        self.userName = userName
        self.onComplete = onComplete
        self.onExitToAuth = onExitToAuth
}


    public var body: some View {
        ZStack {
            switch currentPage {
            case 1:
                Page1BirthYearGender(
                    state: $state,
                    onNext: { advancePage() },
                    onSkip: { advancePage() },
                    onBack: { onExitToAuth?() }
                )
            case 2:
                Page2City(
                    state: $state,
                    onNext: { advancePage() },
                    onSkip: { advancePage() },
                    onBack: { goBack() }
                )
            case 3:
                Page3Profile(
                    state: $state,
                    onNext: { advancePage() },
                    onSkip: { advancePage() },
                    onBack: { goBack() }
                )
            case 4:
                Page4Artists(
                    state: $state,
                    onNext: { advancePage() },
                    onSkip: { advancePage() },
                    onBack: { goBack() }
                )
            case 5:
                Page5Genres(
                    state: $state,
                    onNext: { saveAndComplete() },
                    onSkip: { skipAndComplete() },
                    onBack: { goBack() }
                )
            default:
                EmptyView()
            }

            if isSaving {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                ProgressView("Saving...")
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
            }
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            if let msg = errorMessage {
                Text(msg)
            }
        }
    }

    private func advancePage() {
        withAnimation {
            currentPage = min(currentPage + 1, totalPages)
        }
    }

    private func goBack() {
        withAnimation {
            currentPage = max(currentPage - 1, 1)
        }
    }

    private func saveAndComplete() {
        isSaving = true
        Task {
            do {
                try await OnboardingService.ensureUserExists(userId: userId)
                try await OnboardingService.saveProfile(userId: userId, state: state, name: userName)
                try await OnboardingService.saveArtistPreferences(userId: userId, artists: state.selectedArtists)
                try await OnboardingService.saveGenrePreferences(userId: userId, genres: state.selectedGenres)
                try await OnboardingService.completeOnboarding(userId: userId)
                await MainActor.run {
                    isSaving = false
                    onComplete()
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func skipAndComplete() {
        isSaving = true
        Task {
            do {
                try await OnboardingService.ensureUserExists(userId: userId)
                try await OnboardingService.saveProfile(userId: userId, state: state, name: userName)
                if !state.selectedArtists.isEmpty {
                    try await OnboardingService.saveArtistPreferences(userId: userId, artists: state.selectedArtists)
                }
                if !state.selectedGenres.isEmpty {
                    try await OnboardingService.saveGenrePreferences(userId: userId, genres: state.selectedGenres)
                }
                try await OnboardingService.skipOnboarding(userId: userId)
                await MainActor.run {
                    isSaving = false
                    onComplete()
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}
