//
//  Page5Genres.swift
//  SynthNative
//
//  Genre bubbles from genres table. 15 options, no scroll, wrapping layout.
//

import SwiftUI

struct Page5Genres: View {
    @Binding var state: OnboardingState
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)? = nil

    @State private var defaultGenres: [GenreCategory] = []
    @State private var searchText = ""
    @State private var searchResults: [GenreCategory] = []
    @State private var isLoading = true
    @State private var isSearching = false
    @State private var searchTaskId: UInt64 = 0

    private let debounceMs: UInt64 = 200

    /// 15 options: defaults when no search, search results when typing
    private var displayGenres: [GenreCategory] {
        let q = searchText.trimmingCharacters(in: .whitespaces)
        if q.count >= 2 {
            return Array(searchResults.prefix(15))
        }
        return Array(defaultGenres.prefix(15))
    }

    var body: some View {
        OnboardingPageContainer(
            title: "Choose your interests",
            subtitle: "Get better event recommendations. Select at least 3.",
            canProceed: state.selectedGenres.count >= 3,
            onNext: onNext,
            onSkip: onSkip,
            onBack: onBack
        ) {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding()
                } else {
                    TextField("Search to add more genres...", text: $searchText)
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

                    // 10–15 popular genres in wrapping grid
                    LazyVGrid(columns: [
                        GridItem(.adaptive(minimum: 90, maximum: 130))
                    ], spacing: SynthSpacing.small) {
                        ForEach(displayGenres) { genre in
                            BubbleChip(
                                title: genre.name,
                                isSelected: state.selectedGenres.contains(where: { $0.id == genre.id })
                            ) {
                                if let idx = state.selectedGenres.firstIndex(where: { $0.id == genre.id }) {
                                    state.selectedGenres.remove(at: idx)
                                } else {
                                    state.selectedGenres.append(genre)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, SynthSpacing.screenMarginX)
                    .padding(.vertical, SynthSpacing.small)
                    .background(Color.white)
                    .overlay(
                        RoundedRectangle(cornerRadius: SynthRadius.corner)
                            .stroke(SynthColor.neutral200, lineWidth: 1)
                    )
                    .padding(.horizontal, SynthSpacing.screenMarginX)

                    Text("\(state.selectedGenres.count)/3 minimum selected")
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                        .foregroundColor(state.selectedGenres.count >= 3 ? SynthColor.brandPink500 : SynthColor.neutral600)
                        .padding(.horizontal, SynthSpacing.screenMarginX)
                }
            }
        }
        .task {
            await loadDefaults()
        }
    }

    private func loadDefaults() async {
        do {
            let c = try await GenreCategoriesService.fetchDefaults()
            await MainActor.run {
                defaultGenres = c
                isLoading = false
            }
        } catch {
            await MainActor.run {
                isLoading = false
            }
        }
    }

    private func triggerDebouncedSearch(query: String) {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else {
            searchResults = []
            isSearching = false
            return
        }

        searchTaskId += 1
        let taskId = searchTaskId

        Task {
            try? await Task.sleep(nanoseconds: debounceMs * 1_000_000)
            guard taskId == searchTaskId else { return }

            await MainActor.run { isSearching = true }
            do {
                let r = try await GenreCategoriesService.search(query: q, limit: 15)
                guard taskId == searchTaskId else { return }
                await MainActor.run {
                    searchResults = r
                    isSearching = false
                }
            } catch {
                guard taskId == searchTaskId else { return }
                await MainActor.run {
                    searchResults = []
                    isSearching = false
                }
            }
        }
    }
}
