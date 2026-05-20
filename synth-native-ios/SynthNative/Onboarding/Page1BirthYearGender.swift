//
//  Page1BirthYearGender.swift
//  SynthNative
//
//  Birth year (scroll picker) and gender.
//

import SwiftUI

struct Page1BirthYearGender: View {
    @Binding var state: OnboardingState
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)? = nil

    private let acquisitionOptions = [
        "Friends or Family",
        "Instagram",
        "TikTok",
        "Reddit",
        "LinkedIn",
        "Facebook",
        "App Store",
        "Artist",
        "Venue",
        "Other"
    ]
    private var hasSelectedAcquisition: Bool {
        guard let selection = state.acquisitionSource?.trimmingCharacters(in: .whitespacesAndNewlines), !selection.isEmpty else {
            return false
        }
        if selection.caseInsensitiveCompare("Other") == .orderedSame {
            let otherValue = state.acquisitionSourceOther?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return !otherValue.isEmpty
        }
        return true
    }
    private var isOtherSelected: Bool {
        guard let selection = state.acquisitionSource else { return false }
        return selection.caseInsensitiveCompare("Other") == .orderedSame
    }

    private static let minAge = 13
    private var currentYear: Int { Calendar.current.component(.year, from: Date()) }
    private var years: [Int] {
        (1920...(currentYear - Self.minAge)).reversed()
    }

    var body: some View {
        OnboardingPageContainer(
            title: "What year were you born?",
            subtitle: "We use this to personalize your experience and ensure age-appropriate content.",
            onNext: {
                if let year = state.birthYear {
                    let age = currentYear - year
                    if age < Self.minAge {
                        return
                    }
                }
                onNext()
            },
            onSkip: onSkip,
            onBack: onBack
        ) {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                Picker("Birth year", selection: $state.birthYear) {
                    Text("Select year").tag(nil as Int?)
                    ForEach(years, id: \.self) { year in
                        Text(String(year)).tag(year as Int?)
                    }
                }
                #if os(iOS)
                .pickerStyle(.wheel)
                #else
                .pickerStyle(.menu)
                #endif
                .frame(height: 150)

                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text("Gender (optional)")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                        .foregroundColor(SynthColor.neutral900)
                    Picker("Gender", selection: $state.gender) {
                        Text("Select").tag(nil as String?)
                        Text("Male").tag("male" as String?)
                        Text("Female").tag("female" as String?)
                        Text("Non-binary").tag("non-binary" as String?)
                        Text("Prefer not to say").tag("prefer-not-to-say" as String?)
                        Text("Other").tag("other" as String?)
                    }
                    .pickerStyle(.menu)
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)

                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text("How did you find Synth?")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                        .foregroundColor(SynthColor.neutral900)
                    Menu {
                        ForEach(acquisitionOptions, id: \.self) { option in
                            Button {
                                state.acquisitionSource = option
                                if option.caseInsensitiveCompare("Other") != .orderedSame {
                                    state.acquisitionSourceOther = nil
                                }
                            } label: {
                                Text(option)
                            }
                        }
                    } label: {
                        HStack {
                            Text(state.acquisitionSource ?? "Select an option")
                                .font(SynthFont.font(size: SynthTypography.body.size, weight: .medium))
                                .foregroundColor(state.acquisitionSource == nil ? SynthColor.neutral400 : SynthColor.neutral900)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .foregroundColor(SynthColor.neutral400)
                        }
                        .padding(.vertical, SynthSpacing.small)
                        .padding(.horizontal, SynthSpacing.screenMarginX)
                        .background(
                            RoundedRectangle(cornerRadius: SynthRadius.corner)
                                .fill(Color.white)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: SynthRadius.corner)
                                .stroke(SynthColor.neutral200, lineWidth: 1)
                        )
                    }

                    if isOtherSelected {
                        TextField("Tell us more...", text: Binding(
                            get: { state.acquisitionSourceOther ?? "" },
                            set: { state.acquisitionSourceOther = $0 }
                        ))
                        .textFieldStyle(.roundedBorder)
                    }
                }
                .padding(.horizontal, SynthSpacing.screenMarginX)
            }
        }
    }
}
