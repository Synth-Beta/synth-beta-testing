//
//  SupabaseService.swift
//  SynthNative
//
//  Supabase client singleton for Auth and Database.
//

import Foundation
import Supabase

enum SupabaseService {
    static var client: SupabaseClient {
        let urlStr = Config.supabaseUrl ?? "https://your-project.supabase.co"
        let key = Config.supabaseAnonKey ?? "your-anon-key"
        guard let url = URL(string: urlStr) else {
            fatalError("Invalid Supabase URL")
        }
        let options = SupabaseClientOptions(
            auth: SupabaseClientOptions.AuthOptions(emitLocalSessionAsInitialSession: true)
        )
        return SupabaseClient(supabaseURL: url, supabaseKey: key, options: options)
    }
}

/// Replace with your Supabase project URL and anon key.
enum Config {
    static var supabaseUrl: String? {
        ProcessInfo.processInfo.environment["SUPABASE_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String
    }
    static var supabaseAnonKey: String? {
        ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]
            ?? Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String
    }
}
