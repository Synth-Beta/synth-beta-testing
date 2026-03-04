import SwiftUI
import UIKit

// MARK: - Event Share Data

/// Codable data passed from the web layer to native Swift for sharing.
struct EventShareData: Codable {
    // ── Event fields ───────────────────────────────────────────────
    let eventId:        String
    let title:          String
    let artistName:     String?
    let venueName:      String?
    let venueCity:      String?
    let eventDate:      String?
    let imageUrl:       String?
    let posterImageUrl: String?

    // ── Review fields (nil when sharing an event only) ─────────────
    let reviewId:       String?
    let reviewerName:   String?
    let overallRating:  Double?
    let reviewQuote:    String?
    let shareType:      String?   // "event" | "review"

    var isReview: Bool { shareType == "review" && reviewId != nil }
}

// MARK: - Share Modal Root View

@available(iOS 15.0, *)
struct EventShareModalView: View {
    let event:             EventShareData
    let onDismiss:         () -> Void
    let onShareExternally: () -> Void
    let onShareInChat:     () -> Void

    @State private var dragOffset:  CGFloat = 0
    @State private var cardImage:   UIImage?  = nil
    @State private var artwork:     UIImage?  = nil
    @State private var isRendering: Bool      = true
    @State private var cardData:    SynthShareCardData? = nil

    var body: some View {
        ZStack {
            // Tap-away dismiss
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture { animatedDismiss() }

            VStack(spacing: 0) {
                Spacer()

                // ── Bottom sheet ───────────────────────────────────────
                VStack(spacing: 0) {
                    dragHandle
                    sheetContent
                }
                .frame(maxWidth: .infinity)
                .background(sheetBackground)
                .cornerRadius(24, corners: [.topLeft, .topRight])
                .offset(y: dragOffset)
                .gesture(dragGesture)
            }
        }
        .ignoresSafeArea()
        .task { await prepareCard() }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Drag handle
    // ─────────────────────────────────────────────────────────────────

    private var dragHandle: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(Color.white.opacity(0.22))
            .frame(width: 36, height: 5)
            .padding(.top, 12)
            .padding(.bottom, 8)
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Sheet content
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var sheetContent: some View {
        VStack(spacing: 0) {
            // ── Card preview ──────────────────────────────────────────
            cardPreviewSection
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 20)

            // ── Divider ───────────────────────────────────────────────
            Color.white.opacity(0.07).frame(height: 1)

            // ── Action buttons ────────────────────────────────────────
            actionButtons
                .padding(.top, 18)
                .padding(.horizontal, 20)
                .padding(.bottom, 36 + bottomSafeArea)
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Card preview section
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var cardPreviewSection: some View {
        VStack(spacing: 14) {
            // Label
            HStack {
                Text(event.isReview ? "Your Review Card" : "Your Share Card")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.5))
                    .kerning(0.4)
                    .textCase(.uppercase)
                Spacer()
                if !isRendering {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "#CC2486"))
                }
            }

            // The actual card preview
            if let data = cardData {
                SynthShareCardPreview(data: data, artwork: artwork, isLoading: isRendering)
            } else {
                cardSkeleton
            }
        }
    }

    @ViewBuilder private var cardSkeleton: some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Color.white.opacity(0.06))
            .frame(width: 220, height: 220 * (780 / 390))
            .overlay(
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.2)
            )
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Action buttons
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var actionButtons: some View {
        VStack(spacing: 12) {
            // Primary: Share externally (triggers rendered-image share sheet)
            ShareActionButton(
                icon:     "square.and.arrow.up",
                title:    "Share Card",
                subtitle: isRendering ? "Building card…" : "Save, send or post",
                isPrimary: true,
                isDisabled: false
            ) {
                onShareExternally()
                animatedDismiss()
            }

            // Secondary: Share in Synth chat
            ShareActionButton(
                icon:     "message.fill",
                title:    "Send in Chat",
                subtitle: "Share within Synth",
                isPrimary: false,
                isDisabled: false
            ) {
                onShareInChat()
                animatedDismiss()
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Sheet background
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var sheetBackground: some View {
        ZStack {
            // Base glass layer
            Color(hex: "#0E0E12").opacity(0.96)

            // Subtle top gradient glow
            LinearGradient(
                colors: [
                    Color(hex: "#CC2486").opacity(0.07),
                    Color.clear
                ],
                startPoint: .top, endPoint: .center
            )

            // Glass highlight
            RoundedRectangle(cornerRadius: 0)
                .stroke(
                    LinearGradient(
                        colors: [Color.white.opacity(0.10), Color.white.opacity(0.03)],
                        startPoint: .top, endPoint: .bottom
                    ),
                    lineWidth: 1
                )
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Drag gesture
    // ─────────────────────────────────────────────────────────────────

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                if value.translation.height > 0 {
                    dragOffset = value.translation.height
                }
            }
            .onEnded { value in
                if value.translation.height > 80 {
                    animatedDismiss()
                } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func animatedDismiss() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            onDismiss()
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Card preparation (async)
    // ─────────────────────────────────────────────────────────────────

    private func prepareCard() async {
        // Build card data model
        let shareUrl = URL(string: event.isReview
            ? "https://plusone.app/share?review=\(event.reviewId ?? event.eventId)"
            : "https://plusone.app/share?event=\(event.eventId)"
        ) ?? URL(string: "https://plusone.app")!

        let data = event.isReview
            ? SynthShareCardData.fromReview(event, shareUrl: shareUrl)
            : SynthShareCardData.fromEvent(event, shareUrl: shareUrl)

        cardData = data

        // Download artwork
        if let urlString = data.imageUrl, let url = URL(string: urlString) {
            if let (imgData, _) = try? await URLSession.shared.data(from: url) {
                artwork = UIImage(data: imgData)
            }
        }

        withAnimation(.easeInOut(duration: 0.3)) {
            isRendering = false
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Helpers
    // ─────────────────────────────────────────────────────────────────

    private var bottomSafeArea: CGFloat {
        (UIApplication.shared.connectedScenes.first as? UIWindowScene)?
            .windows.first?.safeAreaInsets.bottom ?? 0
    }
}

// MARK: - Share Action Button

@available(iOS 15.0, *)
struct ShareActionButton: View {
    let icon:       String
    let title:      String
    let subtitle:   String
    let isPrimary:  Bool
    let isDisabled: Bool
    let action:     () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                // Icon
                ZStack {
                    Circle()
                        .fill(isPrimary
                              ? LinearGradient(
                                    colors: [Color(hex: "#CC2486"), Color(hex: "#8D1FF4")],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                              : LinearGradient(
                                    colors: [Color.white.opacity(0.10), Color.white.opacity(0.07)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                        )
                        .frame(width: 44, height: 44)
                        .overlay(
                            Circle()
                                .stroke(Color.white.opacity(isPrimary ? 0.15 : 0.08), lineWidth: 1)
                        )

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                }

                // Labels
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.white.opacity(0.45))
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.25))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(isPrimary ? 0.07 : 0.04))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color.white.opacity(isPrimary ? 0.12 : 0.06), lineWidth: 1)
                    )
            )
            .scaleEffect(isPressed ? 0.97 : 1.0)
            .opacity(isDisabled ? 0.5 : (isPressed ? 0.85 : 1.0))
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isDisabled)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeInOut(duration: 0.08)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.easeInOut(duration: 0.12)) { isPressed = false }
                }
        )
    }
}

// MARK: - UIKit Wrapper VC

@available(iOS 15.0, *)
class EventShareModalViewController: UIViewController {
    private let event:             EventShareData
    private let onShareExternally: () -> Void
    private let onShareInChat:     () -> Void

    init(event: EventShareData,
         onShareExternally: @escaping () -> Void,
         onShareInChat: @escaping () -> Void) {
        self.event             = event
        self.onShareExternally = onShareExternally
        self.onShareInChat     = onShareInChat
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let root = EventShareModalView(
            event: event,
            onDismiss: { [weak self] in
                self?.dismiss(animated: true)
            },
            onShareExternally: { [weak self] in
                self?.onShareExternally()
            },
            onShareInChat: { [weak self] in
                self?.onShareInChat()
            }
        )

        let hosting = UIHostingController(rootView: root)
        hosting.view.backgroundColor = .clear

        addChild(hosting)
        view.addSubview(hosting.view)
        hosting.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hosting.view.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hosting.didMove(toParent: self)
    }
}

// MARK: - Corner radius helper

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCornerShape(radius: radius, corners: corners))
    }
}

private struct RoundedCornerShape: Shape {
    var radius:  CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}

// Note: Color(hex:) is defined in Theme.swift and applies project-wide.
