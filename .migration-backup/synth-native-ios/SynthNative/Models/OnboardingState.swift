//
//  OnboardingState.swift
//  SynthNative
//
//  Collected onboarding data across all pages.
//

import Foundation

struct OnboardingState {
    var birthYear: Int?
    var gender: String?
    var acquisitionSource: String?
    var acquisitionSourceOther: String?
    var city: CityResult?
    var username: String?
    var avatarUrl: String?
    var bio: String?
    var selectedArtists: [ArtistResult] = []
    var selectedGenres: [GenreCategory] = []
}

struct CityResult: Identifiable {
    let id: String
    let normalizedName: String
    let state: String?
    let country: String?
    let centerLatitude: Double?
    let centerLongitude: Double?

    init(id: String, normalizedName: String, state: String?, country: String?, centerLatitude: Double?, centerLongitude: Double?) {
        self.id = id
        self.normalizedName = normalizedName
        self.state = state
        self.country = country
        self.centerLatitude = centerLatitude
        self.centerLongitude = centerLongitude
    }

    var displayName: String {
        if let state = state, !state.isEmpty {
            return "\(normalizedName), \(state)"
        }
        return normalizedName
    }
}

struct ArtistResult: Identifiable {
    let id: String
    let name: String
    let imageUrl: String?
}

struct GenreCategory: Identifiable {
    let id: String
    let name: String
    let normalizedKey: String
    let sortOrder: Int
}
