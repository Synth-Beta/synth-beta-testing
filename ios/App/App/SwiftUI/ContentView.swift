//
//  ContentView.swift
//  Synth
//
//  After native auth/onboarding, shows the full Capacitor web app.
//

import SwiftUI
import SynthNative

struct ContentView: View {
    @StateObject private var headerModel = NativeEventHeaderModel.shared

    var body: some View {
        ZStack(alignment: .top) {
            CapacitorWebView()
                .ignoresSafeArea(.all)
            if headerModel.isVisible {
                NativeEventHeaderView(title: headerModel.title)
                    .zIndex(9999)
            }
        }
    }
}

#Preview {
    ContentView()
}
