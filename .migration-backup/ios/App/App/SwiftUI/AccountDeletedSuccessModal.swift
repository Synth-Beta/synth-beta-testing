//
//  AccountDeletedSuccessModal.swift
//  Synth
//
//  Shows confirmation after an account is permanently deleted.
//

import SwiftUI
import SynthNative

struct AccountDeletedSuccessModal: View {
    @Binding var isPresented: Bool

    var body: some View {
        ZStack {
            Color.black.opacity(0.35)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                HStack {
                    Spacer()
                    Button {
                        isPresented = false
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(SynthColor.neutral600)
                            .frame(width: 32, height: 32)
                    }
                    .accessibilityLabel("Close")
                }

                Text("Account successfully deleted")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(SynthColor.neutral900)
                    .multilineTextAlignment(.center)

                Text("You’re signed out but can always create a new account.")
                    .font(.system(size: 14))
                    .foregroundColor(SynthColor.neutral600)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: 320)
            .padding(24)
            .background(SynthColor.neutral50)
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.25), radius: 20, x: 0, y: 8)
        }
    }
}
