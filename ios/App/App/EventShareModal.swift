import SwiftUI
import UIKit

/// SwiftUI view for Instagram-style share modal with glassmorphism
@available(iOS 15.0, *)
struct EventShareModalView: View {
    let event: EventShareData
    let onDismiss: () -> Void
    let onShareExternally: () -> Void
    let onShareInChat: () -> Void
    
    @State private var dragOffset: CGFloat = 0
    @State private var isDragging = false
    
    var body: some View {
        ZStack {
            // Subtle background overlay (not full screen blocking)
            Color.black.opacity(0.2)
                .ignoresSafeArea()
                .onTapGesture {
                    dismissModal()
                }
            
            // Main modal content - small popup at bottom
            VStack(spacing: 0) {
                Spacer()
                
                VStack(spacing: 0) {
                    // Drag indicator
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.3))
                        .frame(width: 36, height: 5)
                        .padding(.top, 10)
                        .padding(.bottom, 6)
                    
                    // Event preview card (compact)
                    EventPreviewCard(event: event)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                    
                    // Share options (side by side, compact)
                    HStack(spacing: 12) {
                        // Share Externally
                        ShareOptionButton(
                            icon: "square.and.arrow.up",
                            title: "Share Externally",
                            subtitle: "Phone, Apps",
                            color: .pink
                        ) {
                            onShareExternally()
                            dismissModal()
                        }
                        
                        // Share in Chat
                        ShareOptionButton(
                            icon: "message.circle.fill",
                            title: "Share in Chat",
                            subtitle: "Within Synth",
                            color: .pink
                        ) {
                            onShareInChat()
                            dismissModal()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 20)
                }
                .frame(maxWidth: .infinity)
                .frame(height: nil) // Let content determine height
                .background(
                    // Glassmorphism background
                    ZStack {
                        // Base blur layer
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(.ultraThinMaterial)
                        
                        // Liquid glass effect overlay
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.25),
                                        Color.white.opacity(0.1),
                                        Color.pink.opacity(0.05)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        
                        // Subtle border
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.3),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
                .offset(y: dragOffset)
                .gesture(
                    DragGesture()
                        .onChanged { value in
                            if !isDragging {
                                isDragging = true
                            }
                            if value.translation.height > 0 {
                                dragOffset = value.translation.height
                            }
                        }
                        .onEnded { value in
                            isDragging = false
                            if value.translation.height > 80 {
                                dismissModal()
                            } else {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    dragOffset = 0
                                }
                            }
                        }
                )
            }
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: dragOffset)
    }
    
    private func dismissModal() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            onDismiss()
        }
    }
}

/// Event preview card component (compact version)
@available(iOS 15.0, *)
struct EventPreviewCard: View {
    let event: EventShareData
    
    var body: some View {
        HStack(spacing: 10) {
            // Event image (smaller)
            AsyncImage(url: URL(string: event.imageUrl ?? "")) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                case .failure, .empty:
                    RoundedRectangle(cornerRadius: 6)
                        .fill(
                            LinearGradient(
                                colors: [Color.pink.opacity(0.3), Color.purple.opacity(0.3)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .overlay(
                            Image(systemName: "music.note")
                                .font(.system(size: 16))
                                .foregroundColor(.white.opacity(0.6))
                        )
                @unknown default:
                    EmptyView()
                }
            }
            .frame(width: 50, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            
            // Event info (compact)
            VStack(alignment: .leading, spacing: 3) {
                Text(event.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                
                if let venue = event.venueName {
                    Text(venue)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            
            Spacer()
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Color.white.opacity(0.2), lineWidth: 1)
                )
        )
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        if let date = formatter.date(from: dateString) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }
        
        return dateString
    }
}

/// Share option button component (compact version)
@available(iOS 15.0, *)
struct ShareOptionButton: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let action: () -> Void
    
    @State private var isPressed = false
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(color)
                    .frame(width: 48, height: 48)
                    .background(
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        color.opacity(0.15),
                                        color.opacity(0.08)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .overlay(
                                Circle()
                                    .stroke(color.opacity(0.2), lineWidth: 1)
                            )
                    )
                
                VStack(spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    
                    Text(subtitle)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color.white.opacity(0.3),
                                        Color.white.opacity(0.1)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
            .scaleEffect(isPressed ? 0.95 : 1.0)
            .opacity(isPressed ? 0.8 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeInOut(duration: 0.1)) {
                        isPressed = true
                    }
                }
                .onEnded { _ in
                    withAnimation(.easeInOut(duration: 0.1)) {
                        isPressed = false
                    }
                }
        )
    }
}

/// Event data structure for sharing
struct EventShareData: Codable {
    let eventId: String
    let title: String
    let artistName: String?
    let venueName: String?
    let venueCity: String?
    let eventDate: String?
    let imageUrl: String?
    let posterImageUrl: String?
}

/// UIKit wrapper to present SwiftUI modal
@available(iOS 15.0, *)
class EventShareModalViewController: UIViewController {
    private let event: EventShareData
    private let onShareExternally: () -> Void
    private let onShareInChat: () -> Void
    
    init(event: EventShareData, onShareExternally: @escaping () -> Void, onShareInChat: @escaping () -> Void) {
        self.event = event
        self.onShareExternally = onShareExternally
        self.onShareInChat = onShareInChat
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        let hostingController = UIHostingController(
            rootView: EventShareModalView(
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
        )
        
        hostingController.view.backgroundColor = .clear
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hostingController.didMove(toParent: self)
        
        // Make background semi-transparent so cards show through
        view.backgroundColor = .clear
    }
}
