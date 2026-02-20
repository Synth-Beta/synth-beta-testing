//
//  AppAuthModel.swift
//  Synth
//
//  Shared observable state for auth flows between SwiftUI and Capacitor.
//

import SwiftUI

@MainActor
final class AppAuthModel: ObservableObject {
    static let shared = AppAuthModel()

    private init() {}

    @Published var showAccountDeletedSuccess = false
}
