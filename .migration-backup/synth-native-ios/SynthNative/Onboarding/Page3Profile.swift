//
//  Page3Profile.swift
//  SynthNative
//
//  Username, profile image, bio.
//

import SwiftUI
import PhotosUI

struct Page3Profile: View {
    @Binding var state: OnboardingState
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)? = nil

    @State private var usernameError: String?
    @State private var selectedPhoto: PhotosPickerItem?

    var body: some View {
        OnboardingPageContainer(
            title: "Complete your profile",
            subtitle: "Your username is how friends will find you.",
            onNext: {
                guard validateUsername() else { return }
                onNext()
            },
            onSkip: onSkip,
            onBack: onBack
        ) {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text("Username")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                        .foregroundColor(SynthColor.neutral900)
                    TextField("@username", text: Binding(
                        get: { state.username ?? "" },
                        set: { state.username = $0; usernameError = nil }
                    ))
                    .textFieldStyle(.roundedBorder)
                    #if os(iOS)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    #endif
                    if let err = usernameError {
                        Text(err)
                            .font(SynthFont.font(size: 14, weight: .medium))
                            .foregroundColor(.red)
                    }
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)

                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text("Profile photo (optional)")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                        .foregroundColor(SynthColor.neutral900)
                    PhotosPicker(
                        selection: $selectedPhoto,
                        matching: .images
                    ) {
                        profilePhotoView
                    }
                    .onChange(of: selectedPhoto) { _, item in
                        Task {
                            if let data = try? await item?.loadTransferable(type: Data.self), !data.isEmpty {
                                await MainActor.run {
                                    state.avatarUrl = nil
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)

                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text("Bio (optional, max 120 chars)")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                        .foregroundColor(SynthColor.neutral900)
                    TextField("Tell us a bit about yourself...", text: Binding(
                        get: { state.bio ?? "" },
                        set: { state.bio = $0.count <= 120 ? $0 : String($0.prefix(120)) }
                    ))
                    .textFieldStyle(.roundedBorder)
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)
            }
        }
    }

    @ViewBuilder
    private var profilePhotoView: some View {
        if let url = state.avatarUrl, !url.isEmpty, let urlObj = URL(string: url) {
            AsyncImage(url: urlObj) { img in
                img.resizable()
            } placeholder: {
                Color.gray
            }
            .frame(width: 80, height: 80)
            .clipShape(Circle())
        } else {
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(SynthColor.neutral200, lineWidth: 2)
                .frame(width: 80, height: 80)
                .overlay(
                    Text("+")
                        .font(.title)
                        .foregroundColor(SynthColor.neutral400)
                )
        }
    }

    private func validateUsername() -> Bool {
        let u = state.username?.trimmingCharacters(in: .whitespaces) ?? ""
        if u.isEmpty {
            usernameError = "Username is required"
            return false
        }
        if u.count < 3 || u.count > 30 {
            usernameError = "Username must be 3-30 characters"
            return false
        }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_.")
        if u.lowercased().unicodeScalars.contains(where: { !allowed.contains($0) }) {
            usernameError = "Use only letters, numbers, underscores, and periods"
            return false
        }
        return true
    }
}
