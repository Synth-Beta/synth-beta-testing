// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SynthNative",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "SynthNative", targets: ["SynthNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0")
    ],
    targets: [
        .target(
            name: "SynthNative",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift")
            ],
            path: "SynthNative"
        )
    ]
)
