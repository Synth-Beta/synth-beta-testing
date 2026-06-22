//
//  Page4Artists.swift
//  SynthNative
//
//  Select 3 artists, one by one.
//

import SwiftUI

struct Page4Artists: View {
    @Binding var state: OnboardingState
    let onNext: () -> Void
    let onSkip: () -> Void
    var onBack: (() -> Void)? = nil

    @State private var searchText = ""
    @State private var results: [ArtistResult] = []
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var searchTaskId: UInt64 = 0

    private let debounceMs: UInt64 = 200

    private var currentSlot: Int {
        state.selectedArtists.count
    }

    private var prompt: String {
        switch currentSlot {
        case 0: return "Pick your first favorite artist"
        case 1: return "Pick your second favorite artist"
        case 2: return "Pick your third favorite artist"
        default: return "You've selected 3 artists"
        }
    }

    var body: some View {
        OnboardingPageContainer(
            title: prompt,
            subtitle: "Search for artists you love. Select 3 to continue.",
            canProceed: state.selectedArtists.count >= 3,
            onNext: onNext,
            onSkip: onSkip,
            onBack: onBack
        ) {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                if state.selectedArtists.count < 3 {
                    TextField("Search artists...", text: $searchText)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal, SynthSpacing.screenMarginX)
                        .onChange(of: searchText) { _, newValue in
                            triggerDebouncedSearch(query: newValue)
                        }

                    if isSearching {
                        HStack {
                            ProgressView()
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

                    if !results.isEmpty && searchText.trimmingCharacters(in: .whitespaces).count >= 2 {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(results) { artist in
                                Button {
                                    if !state.selectedArtists.contains(where: { $0.id == artist.id }) {
                                        state.selectedArtists.append(artist)
                                        searchText = ""
                                        results = []
                                    }
                                } label: {
                                    HStack {
                                        if let urlStr = artist.imageUrl, let url = URL(string: urlStr) {
                                            AsyncImage(url: url) { img in
                                                img.resizable()
                                            } placeholder: {
                                                Color.gray
                                            }
                                            .frame(width: 40, height: 40)
                                            .clipShape(Circle())
                                        }
                                        Text(artist.name)
                                            .foregroundColor(SynthColor.neutral900)
                                        Spacer()
                                    }
                                    .padding(.vertical, SynthSpacing.small)
                                    .padding(.horizontal, SynthSpacing.screenMarginX)
                                }
                                .buttonStyle(.plain)
                                .disabled(state.selectedArtists.contains(where: { $0.id == artist.id }))

                                if artist.id != results.last?.id {
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

                if !state.selectedArtists.isEmpty {
                    VStack(alignment: .leading, spacing: SynthSpacing.small) {
                        Text("Selected (\(state.selectedArtists.count)/3)")
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: .semibold))
                            .foregroundColor(SynthColor.neutral900)
                        ForEach(state.selectedArtists) { artist in
                            HStack {
                                Text(artist.name)
                                    .foregroundColor(SynthColor.neutral900)
                                Spacer()
                                Button("Remove") {
                                    state.selectedArtists.removeAll { $0.id == artist.id }
                                }
                                .font(SynthFont.font(size: 14, weight: .medium))
                                .foregroundColor(SynthColor.brandPink500)
                            }
                            .padding(.horizontal, SynthSpacing.screenMarginX)
                        }
                    }
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
                let r = try await ArtistSearchService.search(query: q, limit: 20)
                guard taskId == searchTaskId else { return }
                await MainActor.run {
                    results = r
                    isSearching = false
                    searchError = nil
                }
            } catch {
                guard taskId == searchTaskId else { return }
                print("❌ Artist search failed: \(error)")
                await MainActor.run {
                    results = []
                    isSearching = false
                    searchError = "Search failed. Check connection and try again."
                }
            }
        }
    }
}
