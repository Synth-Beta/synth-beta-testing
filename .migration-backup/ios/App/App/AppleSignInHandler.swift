import Foundation
import AuthenticationServices
import Capacitor

@available(iOS 13.0, *)
struct AppleSignInCredential {
    let identityToken: String
    let email: String?
    let fullName: String?
}

@available(iOS 13.0, *)
class AppleSignInHandler: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    
    var completionHandler: ((Result<AppleSignInCredential, Error>) -> Void)?
    
    // MARK: - Public Methods
    
    /// Initiates Apple Sign In flow
    func signIn(completion: @escaping (Result<AppleSignInCredential, Error>) -> Void) {
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
            
            // Apple only returns email/fullName the first time a user authorizes.
            let email = appleIDCredential.email
            
            var fullNameString: String? = nil
            if let nameComponents = appleIDCredential.fullName {
                let formatter = PersonNameComponentsFormatter()
                formatter.style = .default
                let formatted = formatter.string(from: nameComponents).trimmingCharacters(in: .whitespacesAndNewlines)
                if !formatted.isEmpty {
                    fullNameString = formatted
                }
            }
            
            // Success - return token + any optional profile fields
            completionHandler?(.success(AppleSignInCredential(
                identityToken: identityTokenString,
                email: email,
                fullName: fullNameString
            )))
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
            let keyWindow = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }
                .first(where: { $0.isKeyWindow })
            if let keyWindow = keyWindow { return keyWindow }
            fatalError("No window available for Apple Sign In presentation")
        }
        return window
    }
}

