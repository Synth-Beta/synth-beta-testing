//
//  GenreCategoriesService.swift
//  SynthNative
//
//  Fetch genres from genres table. Direct table query with RPC fallback.
//

import Foundation
import Supabase

/// Curated popular genres (10–15). Only these are shown as defaults.
private let popularGenreKeys = ["rock", "pop", "hip hop", "electronic", "country", "jazz", "indie", "blues", "folk", "r&b", "metal", "punk", "soul", "reggae", "classical"]

private struct GenreRow: Decodable {
    let id: UUID
    let name: String
    let normalized_key: String
}

private struct GenreSearchRpcParams: Encodable {
    let p_search_query: String
    let p_limit: Int
}

enum GenreCategoriesService {
    /// Fetch 10–15 popular genres from genres table (curated list only).
    static func fetchDefaults() async throws -> [GenreCategory] {
        do {
            let response: [GenreRow] = try await SupabaseService.client
                .from("genres")
                .select("id,name,normalized_key")
                .in("normalized_key", values: popularGenreKeys)
                .execute()
                .value

            if !response.isEmpty {
                // Preserve our preferred order
                let byKey = Dictionary(uniqueKeysWithValues: response.map { ($0.normalized_key, $0) })
                return popularGenreKeys.compactMap { key in
                    guard let row = byKey[key] else { return nil }
                    return GenreCategory(
                        id: row.id.uuidString,
                        name: row.name,
                        normalizedKey: row.normalized_key,
                        sortOrder: popularGenreKeys.firstIndex(of: key) ?? 999
                    )
                }.sorted { $0.sortOrder < $1.sortOrder }
            }
        } catch {
            print("❌ GenreCategoriesService fetchDefaults failed: \(error)")
        }

        return popularGenreKeys.enumerated().map { i, key in
            GenreCategory(
                id: key,
                name: formatGenreName(key),
                normalizedKey: key,
                sortOrder: i
            )
        }
    }

    private static func formatGenreName(_ key: String) -> String {
        switch key.lowercased() {
        case "r&b": return "R&B"
        case "hip hop": return "Hip Hop"
        default: return key.capitalized
        }
    }

    /// Search genres - direct table query (ILIKE), fallback to search_genres_trigram RPC
    static func search(query: String, limit: Int = 15) async throws -> [GenreCategory] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }

        do {
            return try await searchViaTable(query: trimmed, limit: limit)
        } catch {
            print("❌ GenreCategoriesService table query failed: \(error), trying RPC fallback")
            return try await searchViaRpc(query: trimmed, limit: limit)
        }
    }

    private static func searchViaTable(query: String, limit: Int) async throws -> [GenreCategory] {
        let pattern = "%\(query)%"
        let response: [GenreRow] = try await SupabaseService.client
            .from("genres")
            .select("id,name,normalized_key")
            .ilike("name", pattern: pattern)
            .limit(limit)
            .execute()
            .value

        return response.map { row in
            GenreCategory(
                id: row.id.uuidString,
                name: row.name,
                normalizedKey: row.normalized_key,
                sortOrder: 999
            )
        }
    }

    private static func searchViaRpc(query: String, limit: Int) async throws -> [GenreCategory] {
        let rpc = try SupabaseService.client.rpc(
            "search_genres_trigram",
            params: GenreSearchRpcParams(p_search_query: query, p_limit: limit)
        )

        let rows: [GenreRow] = try await rpc.execute().value
        return rows.map { row in
            GenreCategory(
                id: row.id.uuidString,
                name: row.name,
                normalizedKey: row.normalized_key,
                sortOrder: 999
            )
        }
    }
}
