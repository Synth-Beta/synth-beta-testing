import SwiftUI

struct IconGalleryPreview: View {
    private let sizes: [CGFloat] = [
        SynthSizes.iconSmall,
        SynthSizes.iconStandard,
        // 32pt preview size requested for verification.
        32
    ]

    private let colors: [Color] = [
        SynthColor.neutral600,
        SynthColor.brandPink500
    ]

    private let columns = [
        GridItem(.fixed(SynthSizes.inputHeight), spacing: SynthSpacing.small),
        GridItem(.fixed(SynthSizes.inputHeight), spacing: SynthSpacing.small),
        GridItem(.fixed(SynthSizes.inputHeight), spacing: SynthSpacing.small),
        GridItem(.fixed(SynthSizes.inputHeight), spacing: SynthSpacing.small)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SynthSpacing.grouped) {
                ForEach(sizes, id: \.self) { size in
                    VStack(alignment: .leading, spacing: SynthSpacing.small) {
                        Text("Size \(Int(size))").synth(.h2)
                        ForEach(colors, id: \.self) { color in
                            LazyVGrid(columns: columns, alignment: .center, spacing: SynthSpacing.small) {
                                ForEach(Icon.allCases, id: \.self) { icon in
                                    IconView(icon, size: size, color: color)
                                        .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, SynthSpacing.screenMarginX)
            .padding(.top, SynthSpacing.small)
            .padding(.bottom, SynthSpacing.bottomNav)
        }
        .background(SynthColor.neutral50)
    }
}

#Preview {
    IconGalleryPreview()
}
