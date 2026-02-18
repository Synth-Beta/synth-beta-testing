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
            onSkip: onSkip
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
            }
        }
    }
}
