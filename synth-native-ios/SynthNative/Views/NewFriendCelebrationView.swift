//
//  NewFriendCelebrationView.swift
//  SynthNative
//
//  Fullscreen celebration popup for new friendships with confetti.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Avatar View

private struct AvatarView: View {
    let url: String?
    let size: CGFloat

    init(url: String?, size: CGFloat = 72) {
        self.url = url
        self.size = size
    }

    var body: some View {
        Group {
            if let urlString = url, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    case .failure:
                        placeholder
                    case .empty:
                        placeholder
                    @unknown default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(SynthColor.neutral200, lineWidth: 1)
        )
    }

    private var placeholder: some View {
        Circle()
            .fill(SynthColor.neutral200)
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.4))
                    .foregroundColor(SynthColor.neutral400)
            )
    }
}

// MARK: - Confetti View

#if os(iOS)
private final class ConfettiHostView: UIView {
    private let emitter = CAEmitterLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isUserInteractionEnabled = false
        setupEmitter()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        emitter.frame = bounds
        // Use screen width for centering — overlay + ignoresSafeArea can skew bounds
        let screenW = UIScreen.main.bounds.width
        emitter.emitterPosition = CGPoint(x: screenW / 2, y: -10)
        emitter.emitterSize = CGSize(width: screenW, height: 1)
    }

    private func setupEmitter() {
        let colors: [UIColor] = [
            UIColor(red: 0.8, green: 0.14, blue: 0.53, alpha: 1),   // pink
            UIColor(red: 0.95, green: 0.25, blue: 0.5, alpha: 1),   // hot pink
            UIColor(red: 0.2, green: 0.6, blue: 1, alpha: 1),       // blue
            UIColor(red: 0.2, green: 0.8, blue: 0.4, alpha: 1),     // green
            UIColor(red: 1, green: 0.8, blue: 0.2, alpha: 1),       // gold
            UIColor(red: 0.6, green: 0.3, blue: 0.9, alpha: 1),     // purple
        ]

        let confettiRect = createConfettiRect()
        let confettiCircle = createConfettiCircle()

        var cells: [CAEmitterCell] = []
        for color in colors {
            let cell = CAEmitterCell()
            cell.birthRate = 6
            cell.lifetime = 8
            cell.velocity = 60
            cell.velocityRange = 30
            cell.yAcceleration = 40
            cell.spin = 2
            cell.spinRange = 4
            cell.scaleRange = 0.3
            cell.scale = 0.45
            cell.color = color.cgColor
            cell.contents = confettiRect?.cgImage
            cell.emissionLongitude = -.pi / 2   // straight down
            cell.emissionRange = .pi / 6        // slight spread
            cells.append(cell)

            let circle = CAEmitterCell()
            circle.birthRate = 3
            circle.lifetime = 8
            circle.velocity = 50
            circle.velocityRange = 25
            circle.yAcceleration = 35
            circle.spin = 1.5
            circle.spinRange = 3
            circle.scaleRange = 0.2
            circle.scale = 0.35
            circle.color = color.cgColor
            circle.contents = confettiCircle?.cgImage
            circle.emissionLongitude = -.pi / 2
            circle.emissionRange = .pi / 6
            cells.append(circle)
        }

        emitter.emitterShape = .line
        emitter.emitterCells = cells
        layer.addSublayer(emitter)
    }

    private func createConfettiRect() -> UIImage? {
        let size = CGSize(width: 8, height: 5)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
    }

    private func createConfettiCircle() -> UIImage? {
        let size = CGSize(width: 6, height: 6)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: CGRect(origin: .zero, size: size))
        }
    }
}

private struct ConfettiView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        ConfettiHostView()
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}
#else
private struct ConfettiView: View {
    var body: some View { EmptyView() }
}
#endif

// MARK: - Event Card

private let SOURCE_LABELS: [String: String] = [
    "you_both_attended": "You've both been to",
    "you_both_follow": "You both follow",
    "recommended": "Recommended",
    "fallback": "For you both",
]

private struct EventCardView: View {
    let event: EventSummary
    var onTap: (() -> Void)?

    private var displayLine: String {
        if let artist = event.artistName, !artist.isEmpty,
           let venue = event.venueName ?? event.venueCity, !venue.isEmpty {
            return "\(artist) at \(venue)"
        }
        return event.title
    }

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: SynthSpacing.inline) {
                if let source = event.source, let label = SOURCE_LABELS[source] {
                    Text(label)
                        .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                        .foregroundColor(SynthColor.brandPink500)
                        .padding(.horizontal, SynthSpacing.small)
                        .padding(.vertical, SynthSpacing.inline)
                        .background(
                            RoundedRectangle(cornerRadius: SynthRadius.pill)
                                .fill(SynthColor.brandPink500.opacity(0.1))
                        )
                }
                Text(displayLine)
                    .font(SynthFont.font(size: SynthTypography.body.size, weight: .semibold))
                    .foregroundColor(SynthColor.neutral900)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(SynthSpacing.small)
            .background(
                RoundedRectangle(cornerRadius: SynthRadius.corner)
                    .fill(SynthColor.neutral100)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Shared Follow Grid

private struct SharedFollowCell: View {
    let name: String
    let imageUrl: String?
    let fallbackIcon: String

    init(name: String, imageUrl: String?, fallbackIcon: String = "person.fill") {
        self.name = name
        self.imageUrl = imageUrl
        self.fallbackIcon = fallbackIcon
    }

    var body: some View {
        VStack(spacing: SynthSpacing.inline) {
            Group {
                if let urlString = imageUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        default:
                            placeholderView
                        }
                    }
                } else {
                    placeholderView
                }
            }
            .frame(width: 56, height: 56)
            .clipShape(Circle())
            .overlay(Circle().stroke(SynthColor.neutral200, lineWidth: 1))
            Text(name)
                .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                .foregroundColor(SynthColor.neutral900)
                .lineLimit(2)
                .multilineTextAlignment(.center)
        }
        .frame(width: 80)
    }

    private var placeholderView: some View {
        Circle()
            .fill(SynthColor.neutral200)
            .overlay(Image(systemName: fallbackIcon).font(.system(size: 22)).foregroundColor(SynthColor.neutral400))
    }
}

// MARK: - Main View

public struct NewFriendCelebrationView: View {
    let friendName: String
    let data: CelebrationData
    let onDismiss: () -> Void
    let onEventTap: ((UUID) -> Void)?

    public init(
        friendName: String,
        data: CelebrationData,
        onDismiss: @escaping () -> Void,
        onEventTap: ((UUID) -> Void)? = nil
    ) {
        self.friendName = friendName
        self.data = data
        self.onDismiss = onDismiss
        self.onEventTap = onEventTap
    }

    private var friendshipTitle: String {
        let days = data.friendshipDays
        let dayWord = days == 1 ? "day" : "days"
        return "You've been friends with \(friendName) for \(days) \(dayWord)!"
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                Text(friendshipTitle)
                    .font(SynthFont.font(size: SynthTypography.h1.size, weight: .bold))
                    .foregroundColor(SynthColor.neutral900)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, SynthSpacing.grouped)

                // Profile pictures - Venn overlap, friend on top, synth pink border (2x size)
                HStack(spacing: 0) {
                    Spacer()
                    HStack(spacing: -24) {
                        AvatarView(url: data.currentUserAvatarUrl, size: 144)
                            .overlay(Circle().stroke(SynthColor.brandPink500, lineWidth: 4))
                            .zIndex(0)
                        AvatarView(url: data.friendAvatarUrl, size: 144)
                            .overlay(Circle().stroke(SynthColor.brandPink500, lineWidth: 4))
                            .zIndex(1)
                    }
                    Spacer()
                }
                .padding(.vertical, SynthSpacing.small)

                if !data.eventsAttendedTogether.isEmpty {
                    sectionHeader("Events you've been to together")
                    ForEach(data.eventsAttendedTogether, id: \.id) { event in
                        EventCardView(event: event, onTap: { onEventTap?(event.id) })
                    }
                }

                if !data.sharedGenres.isEmpty {
                    sectionHeader("Shared genres")
                    FlowLayout(spacing: SynthSpacing.inline) {
                        ForEach(data.sharedGenres) { g in
                            HStack(spacing: 4) {
                                Text(g.genre)
                                    .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                                    .foregroundColor(SynthColor.brandPink500)
                                if g.matchPct > 0 {
                                    Text("\(g.matchPct)%")
                                        .font(SynthFont.font(size: 11, weight: .semibold))
                                        .foregroundColor(SynthColor.brandPink500.opacity(0.7))
                                }
                            }
                            .padding(.horizontal, SynthSpacing.small)
                            .padding(.vertical, SynthSpacing.inline)
                            .background(
                                RoundedRectangle(cornerRadius: SynthRadius.pill)
                                    .fill(Color.white)
                            )
                        }
                    }
                }

                if !data.sharedArtists.isEmpty || !data.sharedVenues.isEmpty {
                    sectionHeader("Shared follows")
                    if !data.sharedArtists.isEmpty {
                        Text("Artists")
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                            .foregroundColor(SynthColor.neutral600)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: SynthSpacing.small)], spacing: SynthSpacing.small) {
                            ForEach(data.sharedArtists.prefix(9), id: \.id) { item in
                                SharedFollowCell(name: item.name, imageUrl: item.imageUrl, fallbackIcon: "music.note")
                            }
                        }
                    }
                    if !data.sharedVenues.isEmpty {
                        Text("Venues")
                            .font(SynthFont.font(size: SynthTypography.meta.size, weight: .medium))
                            .foregroundColor(SynthColor.neutral600)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, data.sharedArtists.isEmpty ? 0 : SynthSpacing.small)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), spacing: SynthSpacing.small)], spacing: SynthSpacing.small) {
                            ForEach(data.sharedVenues.prefix(9), id: \.id) { item in
                                SharedFollowCell(name: item.name, imageUrl: item.imageUrl, fallbackIcon: "mappin.circle")
                            }
                        }
                    }
                }

                if !data.suggestedEvents.isEmpty {
                    sectionHeader("Events to check out together")
                    ForEach(data.suggestedEvents, id: \.id) { event in
                        EventCardView(event: event, onTap: { onEventTap?(event.id) })
                    }
                }

                PrimaryButton(title: "Continue", style: .primary) {
                    onDismiss()
                }
                .padding(.top, SynthSpacing.grouped)
                .padding(.bottom, SynthSpacing.grouped)
            }
            .padding(.horizontal, SynthSpacing.screenMarginX)
        }
        .background(SynthColor.neutral50)
        .overlay {
            // Confetti waterfall: full-width, rains down over all content
            ConfettiView()
                .allowsHitTesting(false)
                .ignoresSafeArea()
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(SynthFont.font(size: SynthTypography.h2.size, weight: .bold))
            .foregroundColor(SynthColor.neutral900)
            .padding(.top, SynthSpacing.small)
    }
}

// MARK: - Flow Layout for chips

private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(subviews: subviews, proposal: proposal)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(subviews: subviews, proposal: proposal)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }

    private func arrange(subviews: Subviews, proposal: ProposedViewSize) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}

