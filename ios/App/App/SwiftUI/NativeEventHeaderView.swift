import SwiftUI
import UIKit

struct NativeEventHeaderView: View {
    let title: String

    private var safeAreaTop: CGFloat {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        let keyWindow = windows.first(where: \.isKeyWindow) ?? windows.first
        return keyWindow?.safeAreaInsets.top ?? 0
    }

    private let buttonSize: CGFloat = 44

    var body: some View {
        let topInset = safeAreaTop

        VStack(spacing: 0) {
            HStack {
                Button(action: postBack) {
                    Image(systemName: "chevron.left")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                        .foregroundColor(.primary)
                }
                .frame(width: buttonSize, height: buttonSize)
                .buttonStyle(.plain)
                Spacer()
                Text(title)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity)
                Spacer()
                Button(action: postShare) {
                    IconView(.share2, size: 25, color: SynthColor.neutral900)
                }
                .frame(width: buttonSize, height: buttonSize)
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .frame(height: 56)
            .padding(.top, topInset)
            Divider()
                .background(Color(.separator))
        }
        .frame(height: topInset + 56)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .ignoresSafeArea(edges: .top)
    }

    private func postBack() {
        NotificationCenter.default.post(name: NSNotification.Name("SynthNativeEventHeaderBack"), object: nil)
    }

    private func postShare() {
        NotificationCenter.default.post(name: NSNotification.Name("SynthNativeEventHeaderShare"), object: nil)
    }
}
