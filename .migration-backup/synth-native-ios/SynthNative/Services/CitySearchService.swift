//
//  CitySearchService.swift
//  SynthNative
//
//  Search city_centers via search_city_centers RPC.
//

import Foundation
import Supabase

private struct CitySearchRpcParams: Encodable {
    let query: String
    let max_results: Int
}

enum CitySearchService {
    static func search(query: String, limit: Int = 20) async throws -> [CityResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }

        do {
            return try await searchViaRpc(query: trimmed, limit: limit)
        } catch {
            print("❌ CitySearchService RPC failed: \(error), trying fallback")
            return try await searchViaTableFallback(query: trimmed, limit: limit)
        }
    }

    private static func searchViaRpc(query: String, limit: Int) async throws -> [CityResult] {
        let rpc = try SupabaseService.client.rpc(
            "search_city_centers",
            params: CitySearchRpcParams(query: query, max_results: limit)
        )

        struct CityRow: Decodable {
            let id: UUID
            let normalized_name: String
            let state: String?
            let country: String?
            let center_latitude: Double?
            let center_longitude: Double?

            enum CodingKeys: String, CodingKey {
                case id
                case normalized_name
                case state
                case country
                case center_latitude
                case center_longitude
            }
        }

        let rows: [CityRow] = try await rpc.execute().value
        return rows.map { row in
            CityResult(
                id: row.id.uuidString,
                normalizedName: row.normalized_name,
                state: row.state,
                country: row.country,
                centerLatitude: row.center_latitude,
                centerLongitude: row.center_longitude
            )
        }
    }

    /// Fallback: direct table query with ILIKE when RPC fails (e.g. trigram not matching)
    private static func searchViaTableFallback(query: String, limit: Int) async throws -> [CityResult] {
        let escaped = query.replacingOccurrences(of: " ", with: "%")
        let pattern = "%\(escaped)%"
        let response: [CityRowFallback] = try await SupabaseService.client
            .from("city_centers")
            .select("id,normalized_name,state,country,center_latitude,center_longitude")
            .ilike("normalized_name", pattern: pattern)
            .limit(limit)
            .execute()
            .value

        return response.map { row in
            CityResult(
                id: row.id.uuidString,
                normalizedName: row.normalized_name,
                state: row.state,
                country: row.country,
                centerLatitude: row.center_latitude,
                centerLongitude: row.center_longitude
            )
        }
    }
}

private struct CityRowFallback: Decodable {
    let id: UUID
    let normalized_name: String
    let state: String?
    let country: String?
    let center_latitude: Double?
    let center_longitude: Double?
}
