import Foundation
import SwiftUI
import SVGView

struct IconView: View {
    let icon: Icon
    let size: CGFloat
    let color: Color
    let strokeHex: String?
    let preserveOriginalColors: Bool
    var strokeWidth: CGFloat?

    init(
        _ icon: Icon,
        size: CGFloat,
        color: Color,
        strokeHex: String? = nil,
        preserveOriginalColors: Bool = false,
        strokeWidth: CGFloat? = nil
    ) {
        self.icon = icon
        self.size = size
        self.color = color
        self.strokeHex = strokeHex
        self.preserveOriginalColors = preserveOriginalColors
        self.strokeWidth = strokeWidth
    }

    var body: some View {
        Group {
            if let data = svgData() {
                SVGView(data: data)
                    .aspectRatio(contentMode: .fit)
            } else {
                Color.clear
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(color)
    }

    private func svgData() -> Data? {
        guard let url = Bundle.main.url(forResource: icon.filename, withExtension: "svg", subdirectory: "icons") else {
            return nil
        }

        guard var svg = try? String(contentsOf: url, encoding: .utf8) else {
            return nil
        }

        if let strokeWidth {
            svg = svg.replacingOccurrences(
                of: "stroke-width=\"[^\"]+\"",
                with: "stroke-width=\"\(strokeWidth)\"",
                options: .regularExpression
            )
        }

        if let resolvedHex = resolvedStrokeHex(), preserveOriginalColors == false {
            svg = svg.replacingOccurrences(
                of: "stroke=\"(?!none)[^\"]+\"",
                with: "stroke=\"\(resolvedHex)\"",
                options: .regularExpression
            )
            svg = svg.replacingOccurrences(
                of: "fill=\"(?!none)[^\"]+\"",
                with: "fill=\"\(resolvedHex)\"",
                options: .regularExpression
            )
            svg = svg.replacingOccurrences(
                of: "stroke:(?!none)[^;\\\"]+",
                with: "stroke:\(resolvedHex)",
                options: .regularExpression
            )
            svg = svg.replacingOccurrences(
                of: "fill:(?!none)[^;\\\"]+",
                with: "fill:\(resolvedHex)",
                options: .regularExpression
            )
        }

        return svg.data(using: .utf8)
    }

    private func resolvedStrokeHex() -> String? {
        if let strokeHex {
            return strokeHex
        }

        if color == SynthColor.brandPink500 { return SynthColorHex.brandPink500 }
        if color == SynthColor.brandPink600 { return SynthColorHex.brandPink600 }
        if color == SynthColor.brandPink700 { return SynthColorHex.brandPink700 }
        if color == SynthColor.brandPink050 { return SynthColorHex.brandPink050 }
        if color == SynthColor.neutral50 { return SynthColorHex.neutral50 }
        if color == SynthColor.neutral100 { return SynthColorHex.neutral100 }
        if color == SynthColor.neutral200 { return SynthColorHex.neutral200 }
        if color == SynthColor.neutral400 { return SynthColorHex.neutral400 }
        if color == SynthColor.neutral600 { return SynthColorHex.neutral600 }
        if color == SynthColor.neutral900 { return SynthColorHex.neutral900 }

        return nil
    }
}
