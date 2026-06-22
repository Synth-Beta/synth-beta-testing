//
//  FriendCelebrationService.swift
//  SynthNative
//
//  Fetches new friend celebration data for the celebration popup.
//

import Foundation
import Supabase

// MARK: - Models

public struct CelebrationNotification {
    public let id: UUID
    public let friendId: UUID
    public let friendName: String
}

public struct EventSummary {
    let id: UUID
    let title: String
    let eventDate: String
    let venueCity: String?
    let venueName: String?
    let artistName: String?
    let source: String?
}

public struct SharedFollowSummary {
    public let id: UUID
    public let name: String
    public let imageUrl: String?
}

public struct SharedGenreSummary: Identifiable {
    public let id: String
    public let genre: String
    public let matchPct: Int

    public init(genre: String, matchPct: Int) {
        self.id = genre
        self.genre = genre
        self.matchPct = matchPct
    }
}

public struct CelebrationData {
    public let eventsAttendedTogether: [EventSummary]
    public let sharedGenres: [SharedGenreSummary]
    public let sharedArtists: [SharedFollowSummary]
    public let sharedVenues: [SharedFollowSummary]
    public let suggestedEvents: [EventSummary]
    public let currentUserAvatarUrl: String?
    public let friendAvatarUrl: String?
    public let friendshipDays: Int

    public init(
        eventsAttendedTogether: [EventSummary],
        sharedGenres: [SharedGenreSummary],
        sharedArtists: [SharedFollowSummary] = [],
        sharedVenues: [SharedFollowSummary] = [],
        suggestedEvents: [EventSummary],
        currentUserAvatarUrl: String? = nil,
        friendAvatarUrl: String? = nil,
        friendshipDays: Int = 0
    ) {
        self.eventsAttendedTogether = eventsAttendedTogether
        self.sharedGenres = sharedGenres
        self.sharedArtists = sharedArtists
        self.sharedVenues = sharedVenues
        self.suggestedEvents = suggestedEvents
        self.currentUserAvatarUrl = currentUserAvatarUrl
        self.friendAvatarUrl = friendAvatarUrl
        self.friendshipDays = friendshipDays
    }
}

// MARK: - RPC Params

private struct GetCelebrationDataParams: Encodable {
    let p_friend_id: UUID
}

// MARK: - Notification Row

private struct NotificationRow: Decodable {
    let id: UUID
    let data: NotificationData?
}

private struct NotificationData: Decodable {
    let friend_id: String?
    let friend_name: String?
}

// MARK: - RPC Response (raw JSON)

private struct EventSummaryRaw: Decodable {
    let id: UUID
    let title: String
    let event_date: String
    let venue_city: String?
    let venue_name: String?
    let artist_name: String?
    let source: String?
}

private struct SharedFollowRaw: Decodable {
    let id: UUID
    let name: String
    let image_url: String?
}

private struct SharedGenreRaw: Decodable {
    let genre: String
    let match_pct: Int
}

/// shared_genres can be either [String] (old) or [{ genre, match_pct }] (new).
/// This enum decodes both transparently.
private enum SharedGenreEntry: Decodable {
    case plain(String)
    case withPct(SharedGenreRaw)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let str = try? container.decode(String.self) {
            self = .plain(str)
        } else {
            let obj = try container.decode(SharedGenreRaw.self)
            self = .withPct(obj)
        }
    }

    func toSummary() -> SharedGenreSummary {
        switch self {
        case .plain(let name):
            return SharedGenreSummary(genre: name, matchPct: 0)
        case .withPct(let raw):
            return SharedGenreSummary(genre: raw.genre, matchPct: raw.match_pct)
        }
    }
}

private struct CelebrationDataResponse: Decodable {
    let events_attended_together: [EventSummaryRaw]?
    let shared_genres: [SharedGenreEntry]?
    let shared_artists: [SharedFollowRaw]?
    let shared_venues: [SharedFollowRaw]?
    let suggested_events: [EventSummaryRaw]?
    let current_user_avatar_url: String?
    let friend_avatar_url: String?
    let friendship_days: Int?
}

// MARK: - Service

public enum FriendCelebrationService {
    /// Fetches the first unread friend_accepted notification for the current user (triggers celebration popup).
    public static func fetchUnreadCelebrationNotification() async throws -> CelebrationNotification? {
        let response: [NotificationRow] = try await SupabaseService.client
            .from("notifications")
            .select("id, data")
            .eq("type", value: "friend_accepted")
            .eq("is_read", value: false)
            .order("created_at", ascending: false)
            .limit(1)
            .execute()
            .value

        guard let row = response.first,
              let friendIdStr = row.data?.friend_id,
              let friendId = UUID(uuidString: friendIdStr) else {
            return nil
        }

        return CelebrationNotification(
            id: row.id,
            friendId: friendId,
            friendName: row.data?.friend_name ?? "Friend"
        )
    }

    /// Fetches celebration data (events attended together, shared genres, suggested events) for a friend.
    public static func fetchCelebrationData(friendId: UUID) async throws -> CelebrationData {
        let params = GetCelebrationDataParams(p_friend_id: friendId)
        let response: CelebrationDataResponse = try await SupabaseService.client
            .rpc("get_new_friend_celebration_data", params: params)
            .execute()
            .value

        let eventsAttended = (response.events_attended_together ?? []).map { raw in
            EventSummary(
                id: raw.id,
                title: raw.title,
                eventDate: raw.event_date,
                venueCity: raw.venue_city,
                venueName: raw.venue_name,
                artistName: raw.artist_name,
                source: raw.source
            )
        }
        let sharedGenres = (response.shared_genres ?? []).map { $0.toSummary() }
        let sharedArtists = (response.shared_artists ?? []).map { SharedFollowSummary(id: $0.id, name: $0.name, imageUrl: $0.image_url) }
        let sharedVenues = (response.shared_venues ?? []).map { SharedFollowSummary(id: $0.id, name: $0.name, imageUrl: $0.image_url) }
        let suggestedEvents = (response.suggested_events ?? []).map { raw in
            EventSummary(
                id: raw.id,
                title: raw.title,
                eventDate: raw.event_date,
                venueCity: raw.venue_city,
                venueName: raw.venue_name,
                artistName: raw.artist_name,
                source: raw.source
            )
        }

        return CelebrationData(
            eventsAttendedTogether: eventsAttended,
            sharedGenres: sharedGenres,
            sharedArtists: sharedArtists,
            sharedVenues: sharedVenues,
            suggestedEvents: suggestedEvents,
            currentUserAvatarUrl: response.current_user_avatar_url,
            friendAvatarUrl: response.friend_avatar_url,
            friendshipDays: response.friendship_days ?? 0
        )
    }

    /// Marks a notification as read.
    public static func markAsRead(notificationId: UUID) async throws {
        try await SupabaseService.client
            .from("notifications")
            .update(["is_read": true])
            .eq("id", value: notificationId)
            .execute()
    }
}
