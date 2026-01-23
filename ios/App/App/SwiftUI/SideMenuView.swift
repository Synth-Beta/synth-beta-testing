import SwiftUI

struct MenuCategoryItem: Identifiable {
    let id = UUID()
    let label: String
    let icon: Icon
    let action: () -> Void
}

enum VerificationAccountType {
    case user
    case creator
    case business
    case admin
}

struct VerificationCriterion: Identifiable {
    let id = UUID()
    let label: String
    let description: String
    let target: String
    let met: Bool
}

struct VerificationStatusData {
    let accountType: VerificationAccountType
    let verified: Bool
    let score: Int
    let criteria: [VerificationCriterion]
}

struct SideMenuView: View {
    @Binding var isOpen: Bool
    let userName: String
    let username: String?
    let initial: String
    let menuItems: [MenuCategoryItem]
    let onLogout: () -> Void
    let verificationData: VerificationStatusData?

    var body: some View {
        if isOpen {
            GeometryReader { geometry in
                let overlayWidth = SynthSizes.sideMenuOverlayWidth
                let drawerWidth = geometry.size.width - overlayWidth
                let menuItemWidth = geometry.size.width - overlayWidth - (SynthSpacing.screenMarginX * 2)
                let safeAreaTop = max(geometry.safeAreaInsets.top, SynthSizes.sideMenuSafeAreaTopMin)
                let safeAreaBottom = geometry.safeAreaInsets.bottom

                ZStack(alignment: .trailing) {
                    SideMenuOverlay(width: overlayWidth) {
                        isOpen = false
                    }
                    .zIndex(100)

                    VStack(spacing: 0) {
                        SideMenuSafeAreaSpacer(height: safeAreaTop)

                        SideMenuHeader {
                            isOpen = false
                        }

                        ScrollView {
                            VStack(alignment: .leading, spacing: 0) {
                                SideMenuUserInfo(
                                    name: userName,
                                    username: username,
                                    initial: initial
                                )
                                .padding(.bottom, SynthSpacing.grouped)

                                VStack(spacing: 0) {
                                    ForEach(menuItems) { item in
                                        MenuCategory(label: item.label, icon: item.icon) {
                                            item.action()
                                        }
                                        .frame(width: menuItemWidth, alignment: .leading)
                                    }
                                }

                                if let verificationData {
                                    SideMenuDivider()
                                    SideMenuVerificationSection(data: verificationData)
                                    SideMenuDivider()
                                }

                                SideMenuLogoutButton(action: onLogout)
                                    .padding(.horizontal, -SynthSpacing.screenMarginX)
                            }
                            .padding(.horizontal, SynthSpacing.screenMarginX)
                            .padding(.top, SynthSpacing.grouped)
                            // Ensure the bottom CTA clears the home indicator comfortably.
                            .padding(.bottom, SynthSpacing.grouped + safeAreaBottom)
                        }
                    }
                    .frame(width: drawerWidth)
                    .frame(maxHeight: .infinity)
                    .background(SynthColor.neutral50)
                    .shadow(
                        color: SynthShadow.color,
                        radius: SynthShadow.drawerRadius,
                        x: SynthShadow.drawerX,
                        y: SynthShadow.drawerY
                    )
                    .zIndex(101)
                }
            }
            .ignoresSafeArea()
        }
    }
}

struct SideMenuOverlay: View {
    let width: CGFloat
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            SynthColor.overlay50
                .frame(width: width)
                .contentShape(Rectangle())
                .onTapGesture(perform: onDismiss)

            Spacer()
        }
        .ignoresSafeArea()
    }
}

struct SideMenuSafeAreaSpacer: View {
    let height: CGFloat

    var body: some View {
        SynthColor.neutral50
            .frame(height: height)
            .frame(maxWidth: .infinity)
    }
}

struct SideMenuHeader: View {
    let onClose: () -> Void

    var body: some View {
        // Match global header: 68px content (12 + 44 + 12).
        // Close button sits where the hamburger normally sits.
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Button(action: onClose) {
                IconView(.x, size: SynthSizes.iconStandard, color: SynthColor.neutral900)
                    .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, SynthSpacing.screenMarginX)
        }
        .padding(.vertical, SynthSpacing.small)
        .frame(height: SynthSizes.headerContentHeight + (SynthSpacing.small * 2))
        .background(SynthColor.neutral50)
    }
}

struct SideMenuUserInfo: View {
    let name: String
    let username: String?
    let initial: String

    var body: some View {
        HStack(spacing: 0) {
            ProfilePictureView(size: .medium, variant: .initial, initial: initial)
                .frame(width: SynthSizes.profilePictureMedium, height: SynthSizes.profilePictureMedium)
                .padding(.trailing, SynthSpacing.small)

            VStack(alignment: .leading, spacing: 0) {
                Text(name).synth(.h2, color: SynthColor.neutral900)
                    .lineLimit(1)

                if let username, !username.isEmpty {
                    Text("@\(username)").synth(.meta, color: SynthColor.neutral600)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SideMenuDivider: View {
    var body: some View {
        Rectangle()
            .fill(SynthColor.neutral200)
            .frame(height: SynthSizes.borderThin)
            .frame(maxWidth: .infinity)
            .padding(.vertical, SynthSpacing.grouped)
    }
}

struct SideMenuVerificationSection: View {
    let data: VerificationStatusData

    var body: some View {
        if data.accountType == .user {
            userVerificationCard
        } else {
            nonUserVerificationCard
        }
    }

    private var userVerificationCard: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
            HStack(spacing: SynthSpacing.inline) {
                IconView(.sparkles, size: SynthSizes.iconStandard, color: SynthColor.brandPink500)
                Text(data.verified ? "Verified Account" : "Verification Status")
                    .synth(.h2, color: SynthColor.neutral900)
            }

            if !data.verified && !data.criteria.isEmpty {
                VStack(alignment: .leading, spacing: SynthSpacing.small) {
                    Text(criteriaSummaryText)
                        .synth(.meta, color: SynthColor.neutral600)

                    SideMenuProgressBar(value: progressValue)

                    VStack(spacing: SynthSpacing.small) {
                        ForEach(data.criteria) { criterion in
                            SideMenuVerificationRow(criterion: criterion)
                        }
                    }
                }
            } else if data.verified {
                Text("Your user account is verified and trusted by the Synth community.")
                    .synth(.meta, color: SynthColor.neutral600)

                HStack {
                    Spacer()
                    IconView(.checkCircle, size: SynthSizes.iconLarge, color: SynthColor.statusSuccess500)
                    Spacer()
                }
                .padding(.vertical, SynthSpacing.grouped)
            } else {
                Text("Verification details are not available for this account type.")
                    .synth(.meta, color: SynthColor.neutral600)
            }
        }
        .padding(SynthSpacing.grouped)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SynthColor.neutral50)
        .overlay(
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(SynthColor.neutral200, lineWidth: SynthSizes.borderThin)
        )
    }

    private var nonUserVerificationCard: some View {
        VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
            HStack(spacing: SynthSpacing.inline) {
                IconView(.sparkles, size: SynthSizes.iconStandard, color: SynthColor.brandPink500)
                Text(data.verified ? "Verified Account" : "Verification Status")
                    .synth(.h2, color: SynthColor.neutral900)
            }
            Text(data.verified
                 ? "Your \(accountTypeLabel) account is verified and trusted by the Synth community."
                 : "Verification details are not available for this account type.")
                .synth(.meta, color: SynthColor.neutral600)

            if data.verified {
                HStack {
                    Spacer()
                    IconView(.checkCircle, size: SynthSizes.iconLarge, color: SynthColor.statusSuccess500)
                    Spacer()
                }
                .padding(.vertical, SynthSpacing.grouped)
            }
        }
        .padding(SynthSpacing.grouped)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SynthColor.neutral50)
        .overlay(
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(SynthColor.neutral200, lineWidth: SynthSizes.borderThin)
        )
    }

    private var progressValue: CGFloat {
        guard totalCriteria > 0 else { return 0 }
        return CGFloat(criteriaMet) / CGFloat(totalCriteria)
    }

    private var criteriaMet: Int {
        data.criteria.filter { $0.met }.count
    }

    private var totalCriteria: Int {
        data.criteria.count
    }

    private var criteriaSummaryText: String {
        var summary = "\(criteriaMet) of \(totalCriteria) criteria met"
        let needed = max(0, 4 - criteriaMet)
        if !data.verified && needed > 0 {
            summary += " • \(needed) more needed for verification"
        }
        return summary
    }

    private var accountTypeLabel: String {
        switch data.accountType {
        case .user:
            return "user"
        case .creator:
            return "creator"
        case .business:
            return "business"
        case .admin:
            return "admin"
        }
    }
}

struct SideMenuVerificationRow: View {
    let criterion: VerificationCriterion

    var body: some View {
        HStack(alignment: .top, spacing: SynthSpacing.small) {
            IconView(
                criterion.met ? .checkCircle : .circle,
                size: SynthSizes.iconStandard,
                color: criterion.met ? SynthColor.statusSuccess500 : SynthColor.neutral400
            )

            VStack(alignment: .leading, spacing: SynthSpacing.inline) {
                HStack(alignment: .top, spacing: SynthSpacing.small) {
                    // Title should be bold, can wrap, but do NOT split a single word across lines.
                    Text(criterion.label)
                        .synth(.meta, color: SynthColor.neutral900)
                        .fontWeight(.bold)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true) // wraps at spaces
                        .layoutPriority(1)

                    Spacer(minLength: SynthSpacing.inline)

                    // Badge should never wrap and should expand enough to fit content.
                    SideMenuVerificationBadge(text: criterion.target, isMet: criterion.met)
                        .layoutPriority(2)
                }

                Text(criterion.description)
                    .synth(.meta, color: SynthColor.neutral600)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(SynthSpacing.small)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(criterion.met ? SynthColor.statusSuccess050 : SynthColor.neutral100)
        .overlay(
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(criterion.met ? SynthColor.statusSuccess500 : SynthColor.neutral200,
                        lineWidth: SynthSizes.borderThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: SynthRadius.corner))
    }
}
    

struct SideMenuVerificationBadge: View {
    let text: String
    let isMet: Bool

    var body: some View {
        Text(text)
            .synth(.meta, color: isMet ? SynthColor.statusSuccess500 : SynthColor.neutral600)
            .fontWeight(.semibold)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, SynthSpacing.small)
            .frame(minWidth: 110)
            .frame(height: 28) // ↑ widened so "100% complete" and "3+ attended" fit
            .background(isMet ? SynthColor.statusSuccess050 : SynthColor.neutral100)
            .overlay(
                RoundedRectangle(cornerRadius: SynthRadius.pill)
                    .stroke(isMet ? SynthColor.statusSuccess500 : SynthColor.neutral200,
                            lineWidth: SynthSizes.borderThin)
            )
            .clipShape(RoundedRectangle(cornerRadius: SynthRadius.pill))
            .fixedSize(horizontal: true, vertical: false) // pill grows to fit its text
    }
}


struct SideMenuProgressBar: View {
    let value: CGFloat

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: SynthRadius.pill)
                    .fill(SynthColor.neutral200)

                RoundedRectangle(cornerRadius: SynthRadius.pill)
                    .fill(SynthColor.brandPink500)
                    .frame(width: max(0, min(geo.size.width, geo.size.width * value)))
            }
        }
        .frame(height: 8)
    }
}

struct SideMenuLogoutButton: View {
    let action: () -> Void

    var body: some View {
        SynthButton("Log out", variant: .primary, fullWidth: true, action: action)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, SynthSpacing.bigSection)
    }
}

enum ProfilePictureSize {
    case small
    case medium
    case large

    var value: CGFloat {
        switch self {
        case .small:
            return SynthSizes.profilePictureSmall
        case .medium:
            return SynthSizes.profilePictureMedium
        case .large:
            return SynthSizes.profilePictureLarge
        }
    }
}

enum ProfilePictureVariant {
    case musicIcon
    case initial
    case image
}

struct ProfilePictureView: View {
    let size: ProfilePictureSize
    let variant: ProfilePictureVariant
    let initial: String?
    let image: Image?

    init(size: ProfilePictureSize, variant: ProfilePictureVariant, initial: String? = nil, image: Image? = nil) {
        self.size = size
        self.variant = variant
        self.initial = initial
        self.image = image
    }

    var body: some View {
        ZStack {
            SynthGradient.brand

            switch variant {
            case .image:
                if let image {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    initialView
                }
            case .initial:
                initialView
            case .musicIcon:
                IconView(.music, size: SynthSizes.iconStandard, color: SynthColor.neutral50)
            }
        }
        .frame(width: size.value, height: size.value)
        .clipShape(Circle())
    }

    private var initialView: some View {
        Text(initial?.uppercased() ?? "")
            .font(.custom(SynthTypography.fontFamily, size: initialFontSize))
            .fontWeight(initialFontWeight)
            .foregroundColor(SynthColor.neutral50)
    }

    private var initialFontSize: CGFloat {
        switch size {
        case .small:
            return SynthTypography.meta.size
        case .medium:
            return SynthTypography.body.size
        case .large:
            return SynthTypography.h1.size
        }
    }

    private var initialFontWeight: Font.Weight {
        switch size {
        case .small, .medium:
            return .bold
        case .large:
            return SynthTypography.h1.weight
        }
    }
}

