import SwiftUI

struct EmptyState: View {
    let icon: Icon
    let heading: String
    let description: String

    var body: some View {
        VStack(spacing: SynthSpacing.inline) {
            IconView(icon, size: SynthSizes.iconLarge, color: SynthColor.neutral600)

            Text(heading).synth(.body, color: SynthColor.neutral900)

            Text(description).synth(.meta, color: SynthColor.neutral600)
        }
        .multilineTextAlignment(.center)
    }
}
