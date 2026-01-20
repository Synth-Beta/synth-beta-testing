import Foundation
import AuthenticationServices
import Capacitor

@available(iOS 13.0, *)
class AppleSignInHandler: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    
    var completionHandler: ((Result<String, Error>) -> Void)?
    
    // MARK: - Public Methods
    
    /// Initiates Apple Sign In flow
    func signIn(completion: @escaping (Result<String, Error>) -> Void) {
        self.completionHandler = completion
        
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        
        let authorizationController = ASAuthorizationController(authorizationRequests: [request])
        authorizationController.delegate = self
        authorizationController.presentationContextProvider = self
        authorizationController.performRequests()
    }
    
    // MARK: - ASAuthorizationControllerDelegate
    
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        if let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential {
            guard let identityToken = appleIDCredential.identityToken,
                  let identityTokenString = String(data: identityToken, encoding: .utf8) else {
                let error = NSError(domain: "AppleSignInHandler", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to extract identity token"])
                completionHandler?(.failure(error))
                return
            }
            
            // Success - return the identity token string
            completionHandler?(.success(identityTokenString))
        } else {
            let error = NSError(domain: "AppleSignInHandler", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid authorization credential"])
            completionHandler?(.failure(error))
        }
    }
    
    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        completionHandler?(.failure(error))
    }
    
    // MARK: - ASAuthorizationControllerPresentationContextProviding
    
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first else {
            // Fallback to key window if available
            if let keyWindow = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) {
                return keyWindow
            }
            fatalError("No window available for Apple Sign In presentation")
        }
        return window
    }
}

