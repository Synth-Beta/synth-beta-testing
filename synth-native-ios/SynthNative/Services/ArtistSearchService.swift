//
//  ArtistSearchService.swift
//  SynthNative
//
//  Search artists via direct table query (same as discover page).
//  Uses artists table with ILIKE, matching UnifiedArtistSearchService.getFuzzyMatchedResults.
//

import Foundation
import Supabase

private struct ArtistSearchRpcParams: Encodable {
    let p_search_query: String
    let p_limit: Int
}

private struct ArtistRow: Decodable {
    let id: UUID
    let name: String
    let image_url: String?
}

enum ArtistSearchService {
    /// Search artists - works exactly like discover page (UnifiedArtistSearchService).
    /// Queries artists table directly with ILIKE; falls back to search_artists_trigram RPC if needed.
    static func search(query: String, limit: Int = 20) async throws -> [ArtistResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }

        do {
            return try await searchViaTable(query: trimmed, limit: limit)
        } catch {
            print("❌ ArtistSearchService table query failed: \(error), trying RPC fallback")
            return try await searchViaRpc(query: trimmed, limit: limit)
        }
    }

    /// Direct artists table query - matches discover page getFuzzyMatchedResults logic
    private static func searchViaTable(query: String, limit: Int) async throws -> [ArtistResult] {
        let words = query.split(separator: " ").map(String.init)
        let searchPattern = words.count == 1
            ? "\(query)%"   // Prefix match for single word (faster)
            : "%\(query)%"  // Contains for multi-word

        let rows: [ArtistRow] = try await SupabaseService.client
            .from("artists")
            .select("id,name,image_url")
            .ilike("name", pattern: searchPattern)
            .limit(limit)
            .execute()
            .value

        return rows.map { row in
            ArtistResult(
                id: row.id.uuidString,
                name: row.name,
                imageUrl: row.image_url
            )
        }
    }

    /// Fallback: search_artists_trigram RPC (trigram similarity)
    private static func searchViaRpc(query: String, limit: Int) async throws -> [ArtistResult] {
        let rpc = try SupabaseService.client.rpc(
            "search_artists_trigram",
            params: ArtistSearchRpcParams(p_search_query: query, p_limit: limit)
        )

        struct RpcRow: Decodable {
            let id: UUID
            let name: String
            let image_url: String?
        }

        let rows: [RpcRow] = try await rpc.execute().value
        return rows.map { row in
            ArtistResult(
                id: row.id.uuidString,
                name: row.name,
                imageUrl: row.image_url
            )
        }
    }
}
