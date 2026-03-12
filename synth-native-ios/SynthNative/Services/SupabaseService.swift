//
//  SupabaseService.swift
//  SynthNative
//
//  Supabase client singleton for Auth and Database.
//

import Foundation
import Supabase

enum SupabaseService {
    // Static let with closure = lazy singleton: initialized once on first access,
    // never re-created. Using a computed var was creating a new SupabaseClient on
    // every call, meaning signIn() and currentUserId() used different instances.
    static let client: SupabaseClient = {
        let urlStr = Config.supabaseUrl ?? "https://your-project.supabase.co"
        let key = Config.supabaseKey ?? ""
        guard let url = URL(string: urlStr) else {
            fatalError("Invalid Supabase URL: \(urlStr)")
        }
        let options = SupabaseClientOptions(
            auth: SupabaseClientOptions.AuthOptions(emitLocalSessionAsInitialSession: true)
        )
        return SupabaseClient(supabaseURL: url, supabaseKey: key, options: options)
    }()
}

/// Replace with your Supabase project URL and publishable key.
enum Config {
    static var supabaseUrl: String? {
        ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String
    }

    static var supabaseKey: String? {
        ProcessInfo.processInfo.environment["SUPABASE_PUBLISHABLE_KEY"]
            ?? ProcessInfo.processInfo.environment["SUPABASE_KEY"]
            ?? Bundle.main.object(forInfoDictionaryKey: "SUPABASE_PUBLISHABLE_KEY") as? String
            ?? Bundle.main.object(forInfoDictionaryKey: "SUPABASE_KEY") as? String
    }
}
