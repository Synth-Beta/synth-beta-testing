//
//  AuthView.swift
//  Synth
//
//  Sign in / Sign up with email+password or Apple. Provides real user UUID for onboarding.
//

import SwiftUI
import AuthenticationServices
import SynthNative

struct AuthView: View {
    let onSignedIn: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var isSignUp = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showError = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text("Welcome to Synth")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(SynthColor.neutral900)

                Text("Sign in to get personalized event recommendations")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(SynthColor.neutral600)
                    .multilineTextAlignment(.center)

                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()

                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)

                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 14))
                            .foregroundColor(SynthColor.statusError500)
                    }

                    Button {
                        Task { await performEmailAuth() }
                    } label: {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }
                            Text(isSignUp ? "Create account" : "Sign in")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(SynthColor.brandPink500)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(isLoading || email.isEmpty || password.count < 6)

                    Button {
                        isSignUp.toggle()
                        errorMessage = nil
                    } label: {
                        Text(isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(SynthColor.brandPink500)
                    }
                }
                .padding(.horizontal, 24)

                HStack {
                    Rectangle().frame(height: 1).foregroundColor(SynthColor.neutral200)
                    Text("or")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(SynthColor.neutral600)
                    Rectangle().frame(height: 1).foregroundColor(SynthColor.neutral200)
                }
                .padding(.horizontal, 24)

                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    handleAppleSignIn(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .cornerRadius(10)
                .padding(.horizontal, 24)
            }
            .padding(.vertical, 40)
        }
        .background(SynthColor.neutral50)
        .alert("Error", isPresented: $showError) {
            Button("OK") { showError = false }
        } message: {
            Text(errorMessage ?? "Something went wrong")
        }
    }

    private func performEmailAuth() async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        do {
            if isSignUp {
                try await AuthService.signUp(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
                errorMessage = "Check your email to confirm your account, then sign in."
                return
            } else {
                try await AuthService.signIn(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
            }
            await MainActor.run { onSignedIn() }
        } catch {
            await MainActor.run {
                errorMessage = (error as NSError).localizedDescription
            }
        }
    }

    private func handleAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let token = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Failed to get Apple Sign In token"
                return
            }
            Task {
                await signInWithAppleToken(token)
            }
        case .failure(let error):
            if (error as NSError).code != 1001 {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func signInWithAppleToken(_ token: String) async {
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }

        do {
            try await AuthService.signInWithAppleToken(token)
            await MainActor.run { onSignedIn() }
        } catch {
            await MainActor.run {
                errorMessage = (error as NSError).localizedDescription
            }
        }
    }
}
