//
//  ContentView.swift
//  Synth-SwiftUI
//
//  Created by Lauren Pesce on 1/15/26.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            SynthColor.neutral50.ignoresSafeArea()
            AppShellView()
        }
    }
}

#Preview {
    ContentView()
}
