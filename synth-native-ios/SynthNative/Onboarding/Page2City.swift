//
//  Page2City.swift
//  SynthNative
//
//  City autocomplete from city_centers. Autofill as user types (like discover filters).
//

import SwiftUI

struct Page2City: View {
    @Binding var state: OnboardingState
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)? = nil

    @State private var searchText = ""
    @State private var results: [CityResult] = []
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var searchTaskId: UInt64 = 0

    private let debounceMs: UInt64 = 200

    var body: some View {
        OnboardingPageContainer(
            title: "Where are you based?",
            subtitle: "We'll show you events happening near you.",
            onNext: onNext,
            onSkip: onSkip,
            onBack: onBack
        ) {
            VStack(alignment: .leading, spacing: SynthSpacing.small) {
                TextField("Search for a city...", text: $searchText)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                    .onChange(of: searchText) { _, newValue in
                        triggerDebouncedSearch(query: newValue)
                    }

                if isSearching {
                    HStack {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Searching...")
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                            .foregroundColor(SynthColor.neutral600)
                    }
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                }

                if let error = searchError {
                    Text(error)
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                        .foregroundColor(SynthColor.brandPink500)
                        .padding(.horizontal, SynthSpacing.screenMarginX)
                }

                if let selected = state.city {
                    HStack {
                        Text("Selected: \(selected.displayName)")
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                            .foregroundColor(SynthColor.brandPink500)
                        Spacer()
                        Button("Clear") {
                            state.city = nil
                        }
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                    }
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                }

                if !results.isEmpty && searchText.trimmingCharacters(in: .whitespaces).count >= 2 {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(results) { city in
                                Button {
                                    state.city = city
                                    searchText = ""
                                    results = []
                                } label: {
                                    Text(city.displayName)
                                        .font(SynthFont.font(size: SynthTypography.body.size, weight: .regular))
                                        .foregroundColor(SynthColor.neutral900)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, SynthSpacing.small)
                                        .padding(.horizontal, SynthSpacing.screenMarginX)
                                }
                                .buttonStyle(.plain)

                                if city.id != results.last?.id {
                                    Divider()
                                        .padding(.leading, SynthSpacing.screenMarginX)
                                }
                            }
                        }
                    }
                    .frame(height: SynthSizes.inputHeight * 3)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: SynthRadius.corner)
                            .stroke(SynthColor.neutral200, lineWidth: 1)
                    )
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                }
            }
        }
    }

    private func triggerDebouncedSearch(query: String) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            results = []
            isSearching = false
            searchError = nil
            return
        }

        searchTaskId += 1
        let taskId = searchTaskId

        Task {
            try? await Task.sleep(nanoseconds: debounceMs * 1_000_000)
            guard taskId == searchTaskId else { return }

            await MainActor.run { isSearching = true; searchError = nil }
            do {
                let r = try await CitySearchService.search(query: q, limit: 15)
                guard taskId == searchTaskId else { return }
                await MainActor.run {
                    results = r
                    isSearching = false
                    searchError = nil
                }
            } catch {
                guard taskId == searchTaskId else { return }
                print("❌ City search failed: \(error)")
                await MainActor.run {
                    results = []
                    isSearching = false
                    searchError = "Search failed. Check connection and try again."
                }
            }
        }
    }
}
