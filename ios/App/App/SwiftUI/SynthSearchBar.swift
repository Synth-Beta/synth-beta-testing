import SwiftUI

enum SynthSearchBarWidthVariant {
    case full
    case popup
    case flex
}

struct SynthSearchBar: View {
    @Binding var text: String
    var placeholder: String = "Search…"
    var widthVariant: SynthSearchBarWidthVariant = .full
    var showsClearButton: Bool = true
    var onSubmit: ((String) -> Void)?
    var onClear: (() -> Void)?
    var onFocusChange: ((Bool) -> Void)?
    var isDisabled: Bool = false

    @FocusState private var isFocused: Bool

    private var borderColor: Color {
        isFocused ? SynthColor.brandPink500 : SynthColor.neutral200
    }

    var body: some View {
        HStack(spacing: 0) {
            IconView(.search, size: SynthSizes.iconStandard, color: SynthColor.neutral600)
                .padding(.leading, SynthSpacing.small)

            TextField(
                "",
                text: $text,
                prompt: Text(placeholder)
                    .font(SynthFont.font(size: SynthTypography.meta.size, weight: SynthTypography.meta.weight))
                    .foregroundColor(SynthColor.neutral600)
            )
            .focused($isFocused)
            .font(SynthFont.font(size: SynthTypography.meta.size, weight: SynthTypography.meta.weight))
            .foregroundColor(SynthColor.neutral900)
            .padding(.horizontal, SynthSpacing.inline)
            .disabled(isDisabled)
            .submitLabel(.search)
            .onSubmit { onSubmit?(text) }

            if showsClearButton && !text.isEmpty {
                Button(action: {
                    text = ""
                    onClear?()
                    isFocused = true
                }) {
                    IconView(.x, size: SynthSizes.iconSmall, color: SynthColor.neutral900)
                        .frame(width: SynthSizes.inputHeight, height: SynthSizes.inputHeight)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .frame(height: SynthSizes.inputHeight)
        .background(SynthColor.neutral50)
        .overlay(
            RoundedRectangle(cornerRadius: SynthRadius.corner)
                .stroke(borderColor, lineWidth: 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: SynthRadius.corner))
        .opacity(isDisabled ? 0.6 : 1)
        .layoutPriority(widthVariant == .flex ? 1 : 0)
        .onChange(of: isFocused) { _, focused in
            onFocusChange?(focused)
        }
    }
}
