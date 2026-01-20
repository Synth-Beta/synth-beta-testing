import UIKit
import Capacitor
import UserNotifications
import AuthenticationServices
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, WKScriptMessageHandler {

    var window: UIWindow?
    var appleSignInHandler: AppleSignInHandler?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Set up push notification delegate
        UNUserNotificationCenter.current().delegate = self
        
        // Request notification permissions
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Error requesting notification permission: \(error)")
                return
            }
            
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            } else {
                print("Notification permission denied")
            }
        }
        
        // Set up Apple Sign In listener
        setupAppleSignInListener()
        
        return true
    }
    
    // MARK: - Apple Sign In Listener Setup
    
    func setupAppleSignInListener() {
        // Listen for requests from web layer via NotificationCenter (fallback)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppleSignIn),
            name: NSNotification.Name("RequestAppleSignIn"),
            object: nil
        )
        
        // Set up JavaScript message handler to receive requests from web layer
        // This listens for messages posted via webkit.messageHandlers.appleSignIn
        setupJavaScriptMessageHandler()
    }
    
    /// Sets up WKWebView message handler to receive JavaScript requests
    func setupJavaScriptMessageHandler() {
        // Wait for the web view to be available, then inject the message handler
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first,
               let webView = self.findWebView(in: window) {
                // Configure message handler
                webView.configuration.userContentController.add(self, name: "appleSignIn")
                
                // Inject JavaScript that listens for RequestAppleSignIn events
                // and forwards them to the native message handler
                let script = """
                    (function() {
                        window.addEventListener('RequestAppleSignIn', function() {
                            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.appleSignIn) {
                                window.webkit.messageHandlers.appleSignIn.postMessage({});
                            }
                        });
                    })();
                """
                webView.configuration.userContentController.addUserScript(
                    WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
                )
            }
        }
    }
    
    /// Helper to find WKWebView in window hierarchy
    func findWebView(in window: UIWindow) -> WKWebView? {
        func findWebView(in view: UIView) -> WKWebView? {
            if let webView = view as? WKWebView {
                return webView
            }
            for subview in view.subviews {
                if let webView = findWebView(in: subview) {
                    return webView
                }
            }
            return nil
        }
        
        guard let rootView = window.rootViewController?.view else { return nil }
        return findWebView(in: rootView)
    }
    
    // Handle device token registration
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        
        print("Device token received: \(token)")
        
        // Send token to JavaScript via Capacitor
        NotificationCenter.default.post(
            name: NSNotification.Name("DeviceTokenReceived"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    // Handle registration failure
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }

    // Handle notifications when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // Show notification even when app is in foreground
        // Using .banner and .list instead of deprecated .alert (iOS 14+)
        completionHandler([.banner, .list, .sound, .badge])
    }

    // Handle notification tap
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        print("Notification tapped with data: \(userInfo)")
        
        // Post notification to JavaScript for handling
        NotificationCenter.default.post(
            name: NSNotification.Name("PushNotificationTapped"),
            object: nil,
            userInfo: userInfo
        )
        
        completionHandler()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
    
    // MARK: - Apple Sign In Bridge
    
    /// Initiates Apple Sign In and sends token to web layer via notification
    @objc func handleAppleSignIn() {
        if #available(iOS 13.0, *) {
            appleSignInHandler = AppleSignInHandler()
            appleSignInHandler?.signIn { [weak self] result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let identityToken):
                        // Send token to JavaScript via JavaScript evaluation
                        self?.sendTokenToWebLayer(token: identityToken)
                    case .failure(let error):
                        // Send error to JavaScript
                        self?.sendErrorToWebLayer(error: error.localizedDescription)
                    }
                    self?.appleSignInHandler = nil
                }
            }
        } else {
            // iOS 12 and below - send error
            sendErrorToWebLayer(error: "Apple Sign In requires iOS 13.0 or later")
        }
    }
    
    /// Sends Apple Sign In token to web layer
    func sendTokenToWebLayer(token: String) {
        // Escape token for JavaScript (handle quotes and newlines)
        let escapedToken = token.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        
        // Use JavaScript evaluation to dispatch event to web layer
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('AppleSignInTokenReceived', { 
                        detail: { token: '\(escapedToken)' } 
                    }));
                } catch(e) {
                    console.error('Error dispatching AppleSignInTokenReceived:', e);
                }
            })();
        """
        
        // Post notification (web layer listens for this - primary method)
        NotificationCenter.default.post(
            name: NSNotification.Name("AppleSignInTokenReceived"),
            object: nil,
            userInfo: ["token": token]
        )
        
        // Also try to evaluate JavaScript directly in web view (fallback)
        // Use async dispatch without delay - web view should be ready since we're on main thread
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                self.evaluateJavaScriptInWebView(script: script, in: window)
            }
        }
    }
    
    /// Sends error to web layer
    func sendErrorToWebLayer(error: String) {
        // Escape error message for JavaScript
        let escapedError = error.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('AppleSignInError', { 
                        detail: { error: '\(escapedError)' } 
                    }));
                } catch(e) {
                    console.error('Error dispatching AppleSignInError:', e);
                }
            })();
        """
        
        // Post notification (web layer listens for this - primary method)
        NotificationCenter.default.post(
            name: NSNotification.Name("AppleSignInError"),
            object: nil,
            userInfo: ["error": error]
        )
        
        // Also try to evaluate JavaScript directly in web view (fallback)
        // Use async dispatch without delay - web view should be ready since we're on main thread
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                self.evaluateJavaScriptInWebView(script: script, in: window)
            }
        }
    }
    
    /// Helper to evaluate JavaScript in web view
    func evaluateJavaScriptInWebView(script: String, in window: UIWindow) {
        // Try to find WKWebView recursively
        func findWebView(in view: UIView) -> WKWebView? {
            if let webView = view as? WKWebView {
                return webView
            }
            for subview in view.subviews {
                if let webView = findWebView(in: subview) {
                    return webView
                }
            }
            return nil
        }
        
        // Properly cast and call evaluateJavaScript with completion handler
        if let rootView = window.rootViewController?.view,
           let webView = findWebView(in: rootView) {
            webView.evaluateJavaScript(script) { result, error in
                if let error = error {
                    // Silently fail - NotificationCenter is the primary method
                    print("WebView JavaScript evaluation failed (this is expected if NotificationCenter was used): \(error.localizedDescription)")
                }
            }
        }
    }
    
    // MARK: - WKScriptMessageHandler
    
    /// Receives messages from JavaScript via WKWebView message handler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "appleSignIn" {
            // Handle Apple Sign In request from JavaScript
            handleAppleSignIn()
        }
    }

}
