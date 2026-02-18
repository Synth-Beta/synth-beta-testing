//
//  OnboardingService.swift
//  SynthNative
//
//  Save onboarding data to Supabase: users, user_preference_signals, complete onboarding.
//

import Foundation
import Supabase

enum OnboardingService {
    /// Ensure user row exists in public.users
    static func ensureUserExists(userId: String) async throws {
        struct UserRow: Decodable {
            let user_id: String
        }
        let existing: [UserRow] = try await SupabaseService.client
            .from("users")
            .select("user_id")
            .eq("user_id", value: userId)
            .execute()
            .value

        if !existing.isEmpty { return }

        guard let session = try? await SupabaseService.client.auth.session else {
            throw OnboardingError.noSession
        }
        let name: String = {
            if let n = session.user.userMetadata["name"] {
                return String(describing: n)
            }
            if let f = session.user.userMetadata["full_name"] {
                return String(describing: f)
            }
            if let e = session.user.email, let first = e.components(separatedBy: "@").first {
                return first
            }
            return "User"
        }()
        // Username: 3–30 chars, lowercase, alphanumeric + underscore (per users schema)
        let base = String(name.lowercased().filter { $0.isLetter || $0.isNumber }.prefix(24))
        let suffix = String(UUID().uuidString.prefix(6)).lowercased()
        let username = (base.isEmpty ? "user" : base) + suffix

        struct UserInsert: Encodable {
            let user_id: String
            let name: String
            let username: String
            let bio: String
            let is_public_profile: Bool
        }
        try await SupabaseService.client
            .from("users")
            .insert(UserInsert(
                user_id: userId,
                name: name,
                username: username,
                bio: "Music lover looking to connect at events!",
                is_public_profile: true
            ))
            .execute()
    }

    /// Save profile (birthday, gender, city, username, avatar, bio) and age flags
    static func saveProfile(userId: String, state: OnboardingState, name: String) async throws {
        try await ensureUserExists(userId: userId)

        var birthday: String?
        var ageVerified: Bool?
        var isMinor: Bool?
        var parentalControlsEnabled: Bool?
        var dmRestricted: Bool?
        if let year = state.birthYear {
            birthday = "\(year)-01-01"
            let age = Calendar.current.component(.year, from: Date()) - year
            ageVerified = true
            isMinor = age < 18
            if age < 18 {
                parentalControlsEnabled = true
                dmRestricted = true
            }
        }

        struct UserUpdate: Encodable {
            let user_id: String
            let name: String
            let updated_at: String
            let birthday: String?
            let gender: String?
            let location_city: String?
            let location_state: String?
            let latitude: Double?
            let longitude: Double?
            let username: String?
            let avatar_url: String?
            let bio: String?
            let age_verified: Bool?
            let is_minor: Bool?
            let parental_controls_enabled: Bool?
            let dm_restricted: Bool?
        }

        let update = UserUpdate(
            user_id: userId,
            name: name,
            updated_at: ISO8601DateFormatter().string(from: Date()),
            birthday: birthday,
            gender: state.gender,
            location_city: state.city?.normalizedName,
            location_state: state.city?.state,
            latitude: state.city?.centerLatitude,
            longitude: state.city?.centerLongitude,
            username: state.username?.lowercased().trimmingCharacters(in: .whitespaces),
            avatar_url: state.avatarUrl,
            bio: state.bio,
            age_verified: ageVerified,
            is_minor: isMinor,
            parental_controls_enabled: parentalControlsEnabled,
            dm_restricted: dmRestricted
        )

        try await SupabaseService.client
            .from("users")
            .upsert(update, onConflict: "user_id")
            .execute()
    }

    /// Insert artist preference signals
    static func saveArtistPreferences(userId: String, artists: [ArtistResult]) async throws {
        guard !artists.isEmpty else { return }
        try await ensureUserExists(userId: userId)

        struct SignalInsert: Encodable {
            let user_id: String
            let signal_type: String
            let entity_type: String
            let entity_id: String
            let entity_name: String?
            let genre: String?
            let signal_weight: Double
            let context: String
            let occurred_at: String
        }

        let rows = artists.map { artist in
            SignalInsert(
                user_id: userId,
                signal_type: "artist_manual_preference",
                entity_type: "artist",
                entity_id: artist.id,
                entity_name: nil,
                genre: nil,
                signal_weight: 1.0,
                context: "{\"source\":\"onboarding\"}",
                occurred_at: ISO8601DateFormatter().string(from: Date())
            )
        }

        try await SupabaseService.client
            .from("user_preference_signals")
            .insert(rows)
            .execute()
    }

    /// Insert genre preference signals
    static func saveGenrePreferences(userId: String, genres: [GenreCategory]) async throws {
        guard !genres.isEmpty else { return }
        try await ensureUserExists(userId: userId)

        struct GenreSignalInsert: Encodable {
            let user_id: String
            let signal_type: String
            let entity_type: String
            let entity_id: String?
            let entity_name: String?
            let genre: String
            let signal_weight: Double
            let context: String
            let occurred_at: String
        }

        let rows = genres.map { genre in
            GenreSignalInsert(
                user_id: userId,
                signal_type: "genre_manual_preference",
                entity_type: "genre",
                entity_id: nil,
                entity_name: nil,
                genre: genre.normalizedKey,
                signal_weight: 1.0,
                context: "{\"source\":\"onboarding\"}",
                occurred_at: ISO8601DateFormatter().string(from: Date())
            )
        }

        try await SupabaseService.client
            .from("user_preference_signals")
            .insert(rows)
            .execute()
    }

    /// Mark onboarding as completed
    static func completeOnboarding(userId: String) async throws {
        try await ensureUserExists(userId: userId)
        struct UpdateParams: Encodable {
            let onboarding_completed: Bool
            let onboarding_skipped: Bool
            let updated_at: String
        }
        try await SupabaseService.client
            .from("users")
            .update(UpdateParams(
                onboarding_completed: true,
                onboarding_skipped: false,
                updated_at: ISO8601DateFormatter().string(from: Date())
            ))
            .eq("user_id", value: userId)
            .execute()
    }

    /// Mark onboarding as skipped
    static func skipOnboarding(userId: String) async throws {
        try await ensureUserExists(userId: userId)
        struct UpdateParams: Encodable {
            let onboarding_skipped: Bool
            let onboarding_completed: Bool
            let updated_at: String
        }
        try await SupabaseService.client
            .from("users")
            .update(UpdateParams(
                onboarding_skipped: true,
                onboarding_completed: false,
                updated_at: ISO8601DateFormatter().string(from: Date())
            ))
            .eq("user_id", value: userId)
            .execute()
    }

    /// Check username availability
    static func isUsernameAvailable(_ username: String, excludingUserId: String? = nil) async throws -> Bool {
        let sanitized = username.lowercased().trimmingCharacters(in: .whitespaces)
        guard sanitized.count >= 3, sanitized.count <= 30 else { return false }

        struct UserIdRow: Decodable {
            let user_id: String
        }

        var query = SupabaseService.client
            .from("users")
            .select("user_id")
            .eq("username", value: sanitized)

        if let ex = excludingUserId {
            query = query.neq("user_id", value: ex)
        }

        let rows: [UserIdRow] = try await query.execute().value
        return rows.isEmpty
    }
}

enum OnboardingError: LocalizedError {
    case noSession
    case invalidAge
    case usernameTaken

    var errorDescription: String? {
        switch self {
        case .noSession: return "No authenticated session"
        case .invalidAge: return "You must be at least 13 years old"
        case .usernameTaken: return "Username is already taken"
        }
    }
}
