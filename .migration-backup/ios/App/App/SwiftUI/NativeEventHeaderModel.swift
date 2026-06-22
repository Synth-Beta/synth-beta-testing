import Combine
import Foundation

final class NativeEventHeaderModel: ObservableObject {
    static let shared = NativeEventHeaderModel()

    @Published var isVisible: Bool = false
    @Published var title: String = ""

    private init() {}

    func show(title: String) {
        DispatchQueue.main.async {
            self.title = title
            self.isVisible = true
        }
    }

    func hide() {
        DispatchQueue.main.async {
            self.isVisible = false
        }
    }
}
