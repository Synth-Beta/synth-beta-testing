//
//  ContentView.swift
//  Synth
//
//  After native auth/onboarding, shows the full Capacitor web app.
//

import SwiftUI
import SynthNative

struct ContentView: View {
    var body: some View {
        CapacitorWebView()
            .ignoresSafeArea(.all)
    }
}

#Preview {
    ContentView()
}
