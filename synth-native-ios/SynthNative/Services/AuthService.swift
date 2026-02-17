//
//  AuthService.swift
//  SynthNative
//
//  Auth helpers: session, sign in with Apple token.
//

import Foundation
import Supabase

public enum AuthService {
    /// Current session if authenticated
    public static func currentSession() async throws -> Session? {
        try? await SupabaseService.client.auth.session
    }

    /// Sign in with Apple ID token (from SignInWithAppleButton or AppleSignInHandler)
    public static func signInWithAppleToken(_ idToken: String) async throws {
        _ = try await SupabaseService.client.auth.signInWithIdToken(
            credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken)
        )
    }

    /// Sign in with email and password
    public static func signIn(email: String, password: String) async throws {
        _ = try await SupabaseService.client.auth.signIn(
            email: email,
            password: password
        )
    }

    /// Sign up with email and password
    public static func signUp(email: String, password: String) async throws {
        _ = try await SupabaseService.client.auth.signUp(
            email: email,
            password: password
        )
    }

    /// User ID from current session (nil if not authenticated)
    public static func currentUserId() async -> String? {
        guard let session = try? await SupabaseService.client.auth.session else { return nil }
        return session.user.id.uuidString
    }

    /// Session tokens for web bridge (native auth → web app session injection)
    public static func sessionTokensForWebBridge() async -> (accessToken: String, refreshToken: String)? {
        guard let session = try? await SupabaseService.client.auth.session else { return nil }
        return (session.accessToken, session.refreshToken)
    }

    /// User display name from session metadata
    public static func currentUserName() async -> String {
        guard let session = try? await SupabaseService.client.auth.session else { return "User" }
        for key in ["full_name", "name"] {
            if let val = session.user.userMetadata[key] {
                let s = String(describing: val).trimmingCharacters(in: .whitespaces)
                if !s.isEmpty { return s }
            }
        }
        if let email = session.user.email, let first = email.split(separator: "@").first {
            return String(first)
        }
        return "User"
    }
}
