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
        <html><head><meta name="viewport" content="width=\(size),height=\(size)"/>
        <style>:root {
            --brand-pink-050: \(SynthColorHex.brandPink050);
            --brand-pink-500: \(SynthColorHex.brandPink500);
            --brand-pink-600: \(SynthColorHex.brandPink600);
            --brand-pink-700: \(SynthColorHex.brandPink700);
            --neutral-0: \(SynthColorHex.neutral0);
            --neutral-50: \(SynthColorHex.neutral50);
            --neutral-100: \(SynthColorHex.neutral100);
            --neutral-200: \(SynthColorHex.neutral200);
            --neutral-400: \(SynthColorHex.neutral400);
            --neutral-600: \(SynthColorHex.neutral600);
            --neutral-900: \(SynthColorHex.neutral900);
        }</style></head>
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

    class Coordinator {
        var lastHTML: String = ""
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        // Prevent the icon WKWebView from consuming touch events that belong
        // to the parent SwiftUI Button.
        webView.isUserInteractionEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only reload when the HTML actually changes to avoid the blank-flash
        // that occurs during every async WKWebView load cycle.
        guard html != context.coordinator.lastHTML else { return }
        context.coordinator.lastHTML = html
        webView.loadHTMLString(html, baseURL: nil)
    }
}
