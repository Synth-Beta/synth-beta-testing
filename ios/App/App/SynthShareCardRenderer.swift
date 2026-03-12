import SwiftUI
import UIKit

// MARK: - Share Card Data Model

/// Unified data model for all share card types.
struct SynthShareCardData {
    enum CardType {
        case event      // Sharing an event
        case review     // Sharing a review (includes rating)
    }

    var type:           CardType   = .event
    var headline:       String     = ""       // Primary large text — artist name
    var subheadline:    String?    = nil      // Secondary text — event title
    var badge:          String     = "LIVE EVENT"
    var venueLine:      String?    = nil      // "Venue Name, City"
    var dateLine:       String?    = nil      // "Sat, March 15"
    var imageUrl:       String?    = nil
    var reviewerName:   String?    = nil      // "by @username"
    var rating:         Double?    = nil      // 0...5
    var shareUrl:       URL

    // Build from EventShareData (event type)
    static func fromEvent(_ e: EventShareData, shareUrl: URL) -> SynthShareCardData {
        SynthShareCardData(
            type:        .event,
            headline:    e.artistName ?? e.title,
            subheadline: e.artistName != nil ? e.title : nil,
            badge:       "LIVE EVENT",
            venueLine:   Self.venueLine(name: e.venueName, city: e.venueCity),
            dateLine:    Self.formatDate(e.eventDate),
            imageUrl:    e.posterImageUrl ?? e.imageUrl,
            reviewerName: nil,
            rating:      nil,
            shareUrl:    shareUrl
        )
    }

    // Build from EventShareData (review type)
    static func fromReview(_ e: EventShareData, shareUrl: URL) -> SynthShareCardData {
        SynthShareCardData(
            type:        .review,
            headline:    e.artistName ?? e.title,
            subheadline: e.artistName != nil ? e.title : nil,
            badge:       "REVIEWED ON SYNTH",
            venueLine:   Self.venueLine(name: e.venueName, city: e.venueCity),
            dateLine:    Self.formatDate(e.eventDate),
            imageUrl:    e.posterImageUrl ?? e.imageUrl,
            reviewerName: e.reviewerName,
            rating:      e.overallRating,
            shareUrl:    shareUrl
        )
    }

    private static func venueLine(name: String?, city: String?) -> String? {
        let parts = [name, city].compactMap { $0?.isEmpty == false ? $0 : nil }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    private static func formatDate(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) else { return nil }
        let d = DateFormatter()
        d.dateFormat = "EEE, MMM d"
        return d.string(from: date)
    }
}

// MARK: - Design Tokens (local, matching Theme.swift)

private enum CardColor {
    static let bg            = Color(hex: "#0C0C0E")
    static let bgDeep        = Color(hex: "#060608")
    static let surface       = Color(white: 1, opacity: 0.06)
    static let surfaceBorder = Color(white: 1, opacity: 0.12)
    static let textPrimary   = Color.white
    static let textSecondary = Color(white: 1, opacity: 0.55)
    static let textTertiary  = Color(white: 1, opacity: 0.35)
    static let brandPink     = Color(hex: "#CC2486")
    static let brandPurple   = Color(hex: "#8D1FF4")
    static let starYellow    = Color(hex: "#FCDC5F")
    static let footerLine    = Color(white: 1, opacity: 0.08)
}

private enum CardGradient {
    static let brand = LinearGradient(
        colors: [CardColor.brandPink, CardColor.brandPurple],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let accentLine = LinearGradient(
        colors: [CardColor.brandPink, CardColor.brandPurple, Color(hex: "#CC2486").opacity(0)],
        startPoint: .leading, endPoint: .trailing
    )
    static let darkOverlay = LinearGradient(
        colors: [Color.black.opacity(0.20), Color.black.opacity(0.78)],
        startPoint: .top, endPoint: .bottom
    )
    static let artworkVignette = LinearGradient(
        colors: [Color.black.opacity(0), Color.black.opacity(0.55)],
        startPoint: .top, endPoint: .bottom
    )
    static let noBgFill = LinearGradient(
        colors: [Color(hex: "#1A0A1E"), Color(hex: "#0A0A14")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

// MARK: - Card SwiftUI View

/// The card view used both for live preview in the share sheet
/// and rendered to UIImage by SynthShareCardRenderer.
struct SynthShareCardImageView: View {
    let data:    SynthShareCardData
    let artwork: UIImage?

    // Canvas size: 390 × 780 → rendered at 3× = 1170 × 2340 px
    static let canvasWidth:  CGFloat = 390
    static let canvasHeight: CGFloat = 780

    var body: some View {
        ZStack(alignment: .top) {
            // ── Layer 0: background ────────────────────────────────────
            backgroundLayer

            // ── Layer 1: content stack ─────────────────────────────────
            VStack(alignment: .leading, spacing: 0) {
                topBar
                artworkPanel
                contentSection
                Spacer(minLength: 0)
                footerBar
            }
        }
        .frame(
            width:  SynthShareCardImageView.canvasWidth,
            height: SynthShareCardImageView.canvasHeight
        )
        .clipped()
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Background
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var backgroundLayer: some View {
        ZStack {
            CardColor.bgDeep

            if let uiImage = artwork {
                // Blurred + darkened artwork fill
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
                    .frame(
                        width:  SynthShareCardImageView.canvasWidth * 1.15,
                        height: SynthShareCardImageView.canvasHeight * 1.15
                    )
                    .blur(radius: 72)
                    .overlay(CardColor.bgDeep.opacity(0.62))
            } else {
                CardGradient.noBgFill
                // Ambient glow circles for visual richness
                Circle()
                    .fill(CardColor.brandPink.opacity(0.18))
                    .frame(width: 340, height: 340)
                    .blur(radius: 90)
                    .offset(x: -60, y: -120)
                Circle()
                    .fill(CardColor.brandPurple.opacity(0.14))
                    .frame(width: 280, height: 280)
                    .blur(radius: 80)
                    .offset(x: 120, y: 200)
            }

            // Consistent dark gradient so text is always readable
            CardGradient.darkOverlay
        }
        .frame(
            width:  SynthShareCardImageView.canvasWidth,
            height: SynthShareCardImageView.canvasHeight
        )
        .clipped()
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Top Bar
    // ─────────────────────────────────────────────────────────────────

    private var topBar: some View {
        HStack(spacing: 9) {
            synthLogoMark(size: 30)

            VStack(alignment: .leading, spacing: 1) {
                Text("Synth")
                    .font(.system(size: 16, weight: .bold, design: .default))
                    .foregroundColor(CardColor.textPrimary)
                    .kerning(-0.3)
                Text("for live music lovers")
                    .font(.system(size: 9, weight: .medium, design: .default))
                    .foregroundColor(CardColor.textTertiary)
                    .kerning(0.4)
                    .textCase(.uppercase)
            }

            Spacer()
        }
        .padding(.horizontal, 22)
        .padding(.top, 52)   // safe-area top clearance
        .padding(.bottom, 18)
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Artwork Panel
    // ─────────────────────────────────────────────────────────────────

    private var artworkPanel: some View {
        let size: CGFloat = 296

        return HStack {
            Spacer()
            ZStack {
                // Outer glow
                if artwork != nil {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(CardColor.brandPink.opacity(0.25))
                        .frame(width: size + 12, height: size + 12)
                        .blur(radius: 18)
                }

                // Artwork / placeholder
                if let uiImage = artwork {
                    Image(uiImage: uiImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .overlay(
                            // Vignette bottom edge
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(CardGradient.artworkVignette)
                        )
                        .overlay(
                            // Subtle border
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(CardColor.surfaceBorder, lineWidth: 1)
                        )
                } else {
                    artworkPlaceholder(size: size)
                }

                // Review: rating badge pinned bottom-right of artwork
                if data.type == .review, let rating = data.rating {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            ratingBadge(rating: rating)
                                .padding(12)
                        }
                    }
                    .frame(width: size, height: size)
                }
            }
            Spacer()
        }
        .padding(.bottom, 24)
    }

    @ViewBuilder private func artworkPlaceholder(size: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(CardGradient.noBgFill)
                .overlay(
                    LinearGradient(
                        colors: [CardColor.brandPink.opacity(0.18), CardColor.brandPurple.opacity(0.12)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(CardColor.surfaceBorder, lineWidth: 1)
                )
                .frame(width: size, height: size)

            Image(systemName: "music.note")
                .font(.system(size: 72, weight: .light))
                .foregroundStyle(
                    LinearGradient(
                        colors: [CardColor.brandPink.opacity(0.6), CardColor.brandPurple.opacity(0.4)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
        }
    }

    @ViewBuilder private func ratingBadge(rating: Double) -> some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(CardColor.starYellow)
            Text(String(format: "%.1f", rating))
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(Color.black.opacity(0.72))
                .overlay(Capsule().stroke(CardColor.surfaceBorder, lineWidth: 1))
        )
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Content Section
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private var contentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Badge row
            HStack(spacing: 0) {
                Text(data.badge)
                    .font(.system(size: 10, weight: .bold, design: .default))
                    .foregroundColor(CardColor.brandPink)
                    .kerning(1.8)
                    .textCase(.uppercase)
                Spacer()
            }
            .padding(.bottom, 8)

            // Accent line
            CardGradient.accentLine
                .frame(height: 2)
                .cornerRadius(1)
                .padding(.bottom, 14)

            // ── Review: big star rating ──
            if data.type == .review, let rating = data.rating {
                starRow(rating: rating, size: 26)
                    .padding(.bottom, 10)
            }

            // ── Headline (artist name) ──
            Text(data.headline)
                .font(.system(size: data.type == .review ? 30 : 36, weight: .bold, design: .default))
                .foregroundColor(CardColor.textPrimary)
                .kerning(-0.5)
                .lineLimit(2)
                .padding(.bottom, 6)

            // ── Sub-headline (event title) ──
            if let sub = data.subheadline, !sub.isEmpty {
                Text(sub)
                    .font(.system(size: 15, weight: .medium, design: .default))
                    .foregroundColor(CardColor.textSecondary)
                    .lineLimit(1)
                    .padding(.bottom, 12)
            } else {
                Spacer().frame(height: 12)
            }

            // ── Reviewer ──
            if data.type == .review, let reviewer = data.reviewerName, !reviewer.isEmpty {
                reviewerRow(name: reviewer)
                    .padding(.bottom, 12)
            }

            // ── Meta lines ──
            VStack(alignment: .leading, spacing: 6) {
                if let venue = data.venueLine {
                    metaLine(icon: "mappin", text: venue)
                }
                if let date = data.dateLine {
                    metaLine(icon: "calendar", text: date)
                }
            }
        }
        .padding(.horizontal, 22)
    }

    @ViewBuilder private func starRow(rating: Double, size: CGFloat) -> some View {
        HStack(spacing: 4) {
            ForEach(1...5, id: \.self) { i in
                let filled = Double(i) <= rating
                let half   = !filled && Double(i) - 0.5 <= rating
                Image(systemName: filled ? "star.fill" : (half ? "star.leadinghalf.filled" : "star"))
                    .font(.system(size: size, weight: .medium))
                    .foregroundColor(CardColor.starYellow)
            }
        }
    }

    @ViewBuilder private func reviewerRow(name: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "person.fill")
                .font(.system(size: 11))
                .foregroundColor(CardColor.brandPink)
            Text("by \(name)")
                .font(.system(size: 13, weight: .medium, design: .default))
                .foregroundColor(CardColor.textSecondary)
        }
    }

    @ViewBuilder private func metaLine(icon: String, text: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(CardColor.brandPink.opacity(0.8))
                .frame(width: 16)
            Text(text)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundColor(CardColor.textSecondary)
                .lineLimit(1)
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Footer
    // ─────────────────────────────────────────────────────────────────

    private var footerBar: some View {
        VStack(spacing: 0) {
            CardColor.footerLine
                .frame(height: 1)

            HStack(spacing: 10) {
                synthLogoMark(size: 24)

                Text("plusone.app")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundColor(CardColor.textTertiary)

                Spacer()

                // QR-style hint
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(CardColor.textTertiary)
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 16)
        }
        .padding(.bottom, 10)
    }

    // ─────────────────────────────────────────────────────────────────
    // MARK: Reusable Logo Mark
    // ─────────────────────────────────────────────────────────────────

    @ViewBuilder private func synthLogoMark(size: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(CardGradient.brand)
                .frame(width: size, height: size)
            Image(systemName: "music.note")
                .font(.system(size: size * 0.48, weight: .semibold))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Live Preview Card (for share sheet)

/// Smaller version shown inside the share bottom-sheet (not the rendered image).
struct SynthShareCardPreview: View {
    let data:    SynthShareCardData
    let artwork: UIImage?
    var isLoading: Bool = false

    var body: some View {
        ZStack {
            SynthShareCardImageView(data: data, artwork: artwork)
                .scaleEffect(previewScale)
                .frame(
                    width:  previewWidth,
                    height: previewHeight
                )
                .clipped()
                .cornerRadius(20)
                .shadow(color: Color.black.opacity(0.5), radius: 20, x: 0, y: 8)

            if isLoading {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.black.opacity(0.55))
                    .frame(width: previewWidth, height: previewHeight)
                    .overlay(
                        VStack(spacing: 12) {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(1.2)
                            Text("Building card…")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white.opacity(0.8))
                        }
                    )
            }
        }
    }

    private let previewWidth:  CGFloat = 220
    private let previewHeight: CGFloat = 220 * (780 / 390)  // maintain aspect ratio
    private var previewScale:  CGFloat { previewWidth / SynthShareCardImageView.canvasWidth }
}

// MARK: - Card Renderer

/// Downloads artwork and renders the card to a UIImage.
@MainActor
class SynthShareCardRenderer {
    static let shared = SynthShareCardRenderer()
    private init() {}

    /// Returns (image, shareURL) ready for UIActivityViewController.
    func renderCard(for data: SynthShareCardData) async -> UIImage? {
        // Download artwork concurrently
        let artwork = await downloadArtwork(urlString: data.imageUrl)

        if #available(iOS 16.0, *) {
            return await renderViaImageRenderer(data: data, artwork: artwork)
        } else {
            return renderViaUIKit(data: data, artwork: artwork)
        }
    }

    // MARK: iOS 16+ — ImageRenderer path

    @available(iOS 16.0, *)
    private func renderViaImageRenderer(data: SynthShareCardData, artwork: UIImage?) async -> UIImage? {
        let cardView = SynthShareCardImageView(data: data, artwork: artwork)
        let renderer = ImageRenderer(content: cardView)
        renderer.scale = 3.0
        return renderer.uiImage
    }

    // MARK: iOS 15 fallback — Core Graphics path

    private func renderViaUIKit(data: SynthShareCardData, artwork: UIImage?) -> UIImage? {
        let scale:  CGFloat = 3.0
        let W:      CGFloat = SynthShareCardImageView.canvasWidth
        let H:      CGFloat = SynthShareCardImageView.canvasHeight
        let size = CGSize(width: W * scale, height: H * scale)

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let cgCtx = ctx.cgContext
            cgCtx.scaleBy(x: scale, y: scale)

            // Background
            UIColor(hex: "#0C0C0E").setFill()
            cgCtx.fill(CGRect(origin: .zero, size: CGSize(width: W, height: H)))

            // Blurred artwork background
            if let artwork {
                let ar = artwork.resized(toFill: CGSize(width: W, height: H))
                ar.draw(in: CGRect(origin: .zero, size: CGSize(width: W, height: H)),
                        blendMode: .normal, alpha: 0.38)
            }

            // Dark overlay
            UIColor.black.withAlphaComponent(0.68).setFill()
            cgCtx.fill(CGRect(origin: .zero, size: CGSize(width: W, height: H)))

            // Top bar
            drawFallbackTopBar(ctx: cgCtx, W: W)

            // Artwork panel
            let panelSize: CGFloat = 240
            let panelX    = (W - panelSize) / 2
            let panelY:   CGFloat = 110
            drawFallbackArtwork(ctx: cgCtx, artwork: artwork, rect: CGRect(x: panelX, y: panelY, width: panelSize, height: panelSize))

            // Content
            var y: CGFloat = panelY + panelSize + 28
            y = drawFallbackContent(ctx: cgCtx, data: data, startY: y, W: W)

            // Footer
            drawFallbackFooter(ctx: cgCtx, W: W, H: H)
        }
    }

    // ── Fallback drawing helpers (iOS 15) ────────────────────────────

    private func drawFallbackTopBar(ctx: CGContext, W: CGFloat) {
        // Logo mark
        let logoRect = CGRect(x: 22, y: 50, width: 28, height: 28)
        let logoPath = UIBezierPath(roundedRect: logoRect, cornerRadius: 7)
        ctx.addPath(logoPath.cgPath)
        UIColor(hex: "#CC2486").setFill()
        ctx.fillPath()

        // "Synth" wordmark
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 15, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        "Synth".draw(at: CGPoint(x: 58, y: 53), withAttributes: attrs)
    }

    private func drawFallbackArtwork(ctx: CGContext, artwork: UIImage?, rect: CGRect) {
        let path = UIBezierPath(roundedRect: rect, cornerRadius: 20)
        ctx.saveGState()
        ctx.addPath(path.cgPath)
        ctx.clip()
        if let artwork {
            artwork.resized(toFill: rect.size).draw(in: rect)
        } else {
            UIColor(hex: "#1A0A1E").setFill()
            ctx.fill(rect)
        }
        ctx.restoreGState()

        // Border
        UIColor.white.withAlphaComponent(0.12).setStroke()
        path.lineWidth = 1
        path.stroke()
    }

    private func drawFallbackContent(ctx: CGContext, data: SynthShareCardData, startY: CGFloat, W: CGFloat) -> CGFloat {
        var y = startY
        let lx: CGFloat = 22
        let rw: CGFloat = W - 44

        // Badge
        let badgeAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 10, weight: .bold),
            .foregroundColor: UIColor(hex: "#CC2486"),
            .kern: 1.8
        ]
        data.badge.uppercased().draw(at: CGPoint(x: lx, y: y), withAttributes: badgeAttrs)
        y += 18

        // Accent line
        ctx.setFillColor(UIColor(hex: "#CC2486").cgColor)
        ctx.fill(CGRect(x: lx, y: y, width: rw * 0.6, height: 2))
        y += 12

        // Star rating (review)
        if data.type == .review, let rating = data.rating {
            let stars = (1...5).map { i -> String in
                Double(i) <= rating ? "★" : "☆"
            }.joined()
            let starAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 24, weight: .medium),
                .foregroundColor: UIColor(hex: "#FCDC5F")
            ]
            stars.draw(at: CGPoint(x: lx, y: y), withAttributes: starAttrs)
            y += 34
        }

        // Headline
        let headlineAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 30, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        let headlineRect = CGRect(x: lx, y: y, width: rw, height: 80)
        data.headline.draw(with: headlineRect, options: .usesLineFragmentOrigin, attributes: headlineAttrs, context: nil)
        y += 42

        // Subheadline
        if let sub = data.subheadline, !sub.isEmpty {
            let subAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 14, weight: .medium),
                .foregroundColor: UIColor.white.withAlphaComponent(0.55)
            ]
            sub.draw(at: CGPoint(x: lx, y: y), withAttributes: subAttrs)
            y += 22
        }

        // Reviewer
        if data.type == .review, let reviewer = data.reviewerName, !reviewer.isEmpty {
            let rvAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 13, weight: .medium),
                .foregroundColor: UIColor.white.withAlphaComponent(0.55)
            ]
            "by \(reviewer)".draw(at: CGPoint(x: lx, y: y), withAttributes: rvAttrs)
            y += 22
        }
        y += 8

        // Meta lines
        let metaAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 13, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.50)
        ]
        if let venue = data.venueLine {
            "📍  \(venue)".draw(at: CGPoint(x: lx, y: y), withAttributes: metaAttrs)
            y += 20
        }
        if let date = data.dateLine {
            "📅  \(date)".draw(at: CGPoint(x: lx, y: y), withAttributes: metaAttrs)
            y += 20
        }

        return y
    }

    private func drawFallbackFooter(ctx: CGContext, W: CGFloat, H: CGFloat) {
        // Divider
        UIColor.white.withAlphaComponent(0.08).setFill()
        ctx.fill(CGRect(x: 0, y: H - 52, width: W, height: 1))

        // Logo mark
        let logoRect = CGRect(x: 22, y: H - 40, width: 22, height: 22)
        let logoPath = UIBezierPath(roundedRect: logoRect, cornerRadius: 5)
        ctx.addPath(logoPath.cgPath)
        UIColor(hex: "#CC2486").setFill()
        ctx.fillPath()

        // URL
        let urlAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: 11, weight: .regular),
            .foregroundColor: UIColor.white.withAlphaComponent(0.35)
        ]
        "plusone.app".draw(at: CGPoint(x: 52, y: H - 36), withAttributes: urlAttrs)
    }

    // MARK: Artwork Download

    private func downloadArtwork(urlString: String?) async -> UIImage? {
        guard let string = urlString, let url = URL(string: string) else { return nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return UIImage(data: data)
        } catch {
            return nil
        }
    }
}

// MARK: - UIColor hex extension (local)

private extension UIColor {
    convenience init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: s).scanHexInt64(&value)
        let r = CGFloat((value >> 16) & 0xFF) / 255
        let g = CGFloat((value >>  8) & 0xFF) / 255
        let b = CGFloat( value        & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}

// MARK: - UIImage resize helper

private extension UIImage {
    func resized(toFill size: CGSize) -> UIImage {
        let scale = max(size.width / self.size.width, size.height / self.size.height)
        let newSize = CGSize(width: self.size.width * scale, height: self.size.height * scale)
        let origin  = CGPoint(x: (size.width  - newSize.width)  / 2,
                              y: (size.height - newSize.height) / 2)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { _ in
            self.draw(in: CGRect(origin: origin, size: newSize))
        }
    }
}

// MARK: - Xcode Previews

#Preview("Event Card — with image") {
    let data = SynthShareCardData(
        type:        .event,
        headline:    "Billie Eilish",
        subheadline: "Hit Me Hard and Soft Tour",
        badge:       "LIVE EVENT",
        venueLine:   "Madison Square Garden, New York",
        dateLine:    "Sat, Apr 12",
        imageUrl:    nil,   // swap in a real URL to test with artwork
        reviewerName: nil,
        rating:      nil,
        shareUrl:    URL(string: "https://plusone.app/share?event=demo")!
    )
    ScrollView {
        SynthShareCardImageView(data: data, artwork: nil)
    }
    .background(Color(hex: "#111"))
}

#Preview("Review Card — 4.5 stars") {
    let data = SynthShareCardData(
        type:        .review,
        headline:    "Kendrick Lamar",
        subheadline: "GNX Tour",
        badge:       "REVIEWED ON SYNTH",
        venueLine:   "Crypto.com Arena, Los Angeles",
        dateLine:    "Fri, Mar 7",
        imageUrl:    nil,
        reviewerName: "@tejpatel",
        rating:      4.5,
        shareUrl:    URL(string: "https://plusone.app/share?review=demo")!
    )
    ScrollView {
        SynthShareCardImageView(data: data, artwork: nil)
    }
    .background(Color(hex: "#111"))
}

#Preview("Share Sheet Bottom Drawer") {
    let data = SynthShareCardData(
        type:        .event,
        headline:    "Taylor Swift",
        subheadline: "The Eras Tour",
        badge:       "LIVE EVENT",
        venueLine:   "SoFi Stadium, Inglewood",
        dateLine:    "Sat, Aug 3",
        imageUrl:    nil,
        reviewerName: nil,
        rating:      nil,
        shareUrl:    URL(string: "https://plusone.app/share?event=demo")!
    )
    ZStack {
        Color.black.ignoresSafeArea()
        VStack {
            Spacer()
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Color.white.opacity(0.22))
                    .frame(width: 36, height: 5)
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                VStack(spacing: 16) {
                    SynthShareCardPreview(data: data, artwork: nil, isLoading: false)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .frame(maxWidth: .infinity)
            .background(Color(hex: "#0E0E12").opacity(0.97))
            .cornerRadius(24, corners: [.topLeft, .topRight])
        }
    }
}
