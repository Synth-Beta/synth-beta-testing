import SwiftUI

enum SynthColor {
    static let neutral0 = Color(hex: "#FFFFFF")
    static let neutral50 = Color(hex: "#FCFCFC")
    static let neutral100 = Color(hex: "#F5F5F5")
    static let neutral200 = Color(hex: "#E6E6E6")
    static let neutral400 = Color(hex: "#8A8F98")
    static let neutral600 = Color(hex: "#5D646F")
    static let neutral900 = Color(hex: "#0E0E0E")

    static let brandPink050 = Color(hex: "#FDF2F7")
    static let brandPink500 = Color(hex: "#CC2486")
    static let brandPink600 = Color(hex: "#951A6D")
    static let brandPink700 = Color(hex: "#7B1559")

    static let statusSuccess050 = Color(hex: "#E6F4ED")
    static let statusSuccess500 = Color(hex: "#2E8B63")
    static let statusWarning050 = Color(hex: "#FFF6D6")
    static let statusWarning500 = Color(hex: "#B88900")
    static let statusError050 = Color(hex: "#FDECEA")
    static let statusError500 = Color(hex: "#C62828")

    static let infoBlue050 = Color(hex: "#F0F6FE")
    static let infoBlue500 = Color(hex: "#1F66EA")

    static let stateDisabledBg = Color(hex: "#E6E6E6")
    static let stateDisabledText = Color(hex: "#5D646F")

    static let overlay50 = Color(hex: "#0E0E0E").opacity(0.5)
    static let overlay20 = Color(hex: "#0E0E0E").opacity(0.2)

    static let ratingStar = Color(hex: "#FCDC5F")
}

enum SynthColorHex {
    static let neutral0 = "#FFFFFF"
    static let neutral50 = "#FCFCFC"
    static let neutral100 = "#F5F5F5"
    static let neutral200 = "#E6E6E6"
    static let neutral400 = "#8A8F98"
    static let neutral600 = "#5D646F"
    static let neutral900 = "#0E0E0E"

    static let brandPink050 = "#FDF2F7"
    static let brandPink500 = "#CC2486"
    static let brandPink600 = "#951A6D"
    static let brandPink700 = "#7B1559"
}

enum SynthGradient {
    static let brand = LinearGradient(
        colors: [SynthColor.brandPink500, Color(hex: "#8D1FF4")],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let soft = LinearGradient(
        colors: [SynthColor.neutral0, SynthColor.brandPink050],
        startPoint: .top,
        endPoint: .bottom
    )
}

enum SynthTypography {
    static let fontFamily = "Inter"

    struct Style {
        let size: CGFloat
        let weight: Font.Weight
        let lineHeight: CGFloat
        let letterSpacing: CGFloat?
        let defaultColor: Color
    }

    static let h1 = Style(
        size: 35,
        weight: .bold,
        lineHeight: 35 * 1.2,
        letterSpacing: nil,
        defaultColor: SynthColor.neutral900
    )

    static let h2 = Style(
        size: 24,
        weight: .bold,
        lineHeight: 24 * 1.3,
        letterSpacing: nil,
        defaultColor: SynthColor.neutral900
    )

    static let body = Style(
        size: 20,
        weight: .medium,
        lineHeight: 20 * 1.5,
        letterSpacing: nil,
        defaultColor: SynthColor.neutral900
    )

    static let accent = Style(
        size: 20,
        weight: .bold,
        lineHeight: 20 * 1.5,
        letterSpacing: nil,
        defaultColor: SynthColor.neutral900
    )

    static let meta = Style(
        size: 16,
        weight: .medium,
        lineHeight: 16 * 1.5,
        letterSpacing: nil,
        defaultColor: SynthColor.neutral600
    )

    static let steps = Style(
        size: 16,
        weight: .medium,
        lineHeight: 16 * 1.5,
        letterSpacing: 16 * 0.2,
        defaultColor: SynthColor.neutral900
    )
}

enum SynthSpacing {
    static let inline: CGFloat = 6
    static let small: CGFloat = 12
    static let grouped: CGFloat = 24
    static let bigSection: CGFloat = 60
    static let screenMarginX: CGFloat = 20
    static let bottomNav: CGFloat = 112
    static let bottomNavPaddingY: CGFloat = 20
    static let menuCategoryPaddingY: CGFloat = 11
}

enum SynthRadius {
    static let corner: CGFloat = 10
    static let pill: CGFloat = 999
    static let circle: CGFloat = 0.5
}

enum SynthSizes {
    static let headerContentHeight: CGFloat = 44
    static let borderThin: CGFloat = 1
    static let buttonHeight: CGFloat = 36
    static let buttonTertiaryHeight: CGFloat = 22
    static let iconSmall: CGFloat = 16
    static let iconStandard: CGFloat = 24
    static let iconMedium: CGFloat = 35
    static let iconLarge: CGFloat = 60
    static let bottomNavHeight: CGFloat = 80
    static let inputHeight: CGFloat = 44
    static let bottomNavCTAWidth: CGFloat = 70
    static let bottomNavCTAHeight: CGFloat = 40
    static let bottomNavBorderWidth: CGFloat = 2
    static let dropdownMinWidth: CGFloat = 200
    static let sideMenuOverlayWidth: CGFloat = 78
    static let menuItemRowHeight: CGFloat = 48
    static let sideMenuSafeAreaTopMin: CGFloat = 15
    static let profilePictureSmall: CGFloat = 32
    static let profilePictureMedium: CGFloat = 45
    static let profilePictureLarge: CGFloat = 75
}

enum SynthShadow {
    static let color = Color.black.opacity(0.25)
    static let radius: CGFloat = 4
    static let x: CGFloat = 0
    static let y: CGFloat = 4
    static let drawerRadius: CGFloat = 8
    static let drawerX: CGFloat = -4
    static let drawerY: CGFloat = 0
}

#if canImport(UIKit)
import UIKit
#endif

enum SynthFont {
    static func font(size: CGFloat, weight: Font.Weight) -> Font {
        #if canImport(UIKit)
        // If Inter is not properly included in the target, fall back to system font.
        if UIFont(name: SynthTypography.fontFamily, size: size) != nil {
            return .custom(SynthTypography.fontFamily, size: size)
        }
        #endif
        return .system(size: size, weight: weight)
    }
}


extension Color {
    init(hex: String) {
        let sanitized = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitized).scanHexInt64(&value)

        let red = Double((value >> 16) & 0xFF) / 255.0
        let green = Double((value >> 8) & 0xFF) / 255.0
        let blue = Double(value & 0xFF) / 255.0

        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }
}
