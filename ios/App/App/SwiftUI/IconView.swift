import Foundation
import SwiftUI
import WebKit

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
            if let html = svgHtml() {
                SVGWebView(html: html)
            } else {
                Color.clear
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(color)
    }

    private func svgHtml() -> String? {
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

        return """
        <html><head><meta name="viewport" content="width=\(size),height=\(size)"/></head>
        <body style="margin:0;padding:0;background:transparent;"><div style="width:\(size)px;height:\(size)px;">\(svg)</div></body></html>
        """
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

private struct SVGWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: nil)
    }
}
