import UIKit
import Capacitor
import UserNotifications
import AuthenticationServices
import WebKit
import SwiftUI
import SynthNative

class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, WKScriptMessageHandler {

    var window: UIWindow?
    var appleSignInHandler: AppleSignInHandler?
    var eventShareHandler: Any? // EventShareHandler (Any? to avoid import issues)

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Do NOT clear WKWebsiteDataStore on launch - it wipes session storage and breaks
        // sign-in persistence. Users should stay signed in until they sign out or reinstall.
        
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
        
        // Set up Event Share listener
        setupEventShareListener()
        
        // Listen for native-to-web event open (e.g. from celebration popup)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSynthOpenEvent(_:)),
            name: NSNotification.Name("SynthOpenEvent"),
            object: nil
        )
        
        // Listen for native header controls coming from SwiftUI overlay
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSynthNativeEventHeaderBack(_:)),
            name: NSNotification.Name("SynthNativeEventHeaderBack"),
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSynthNativeEventHeaderShare(_:)),
            name: NSNotification.Name("SynthNativeEventHeaderShare"),
            object: nil
        )
        
        return true
    }
    
    /// Weak reference to current Capacitor web view for native-to-web communication
    private weak var currentWebView: WKWebView?
    
    @objc private func handleSynthOpenEvent(_ notification: Notification) {
        guard let eventId = notification.userInfo?["eventId"] as? String else { return }
        let escaped = eventId.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('open-event-details', { detail: { eventId: '\(escaped)' } }));
                } catch (e) { console.error('SynthOpenEvent error:', e); }
            })();
            """
        evaluateScriptOnAvailableWebView(script: script)
    }

    @objc private func handleSynthNativeEventHeaderBack(_ notification: Notification) {
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('synthNativeEventHeaderBack'));
                } catch (e) { console.error('SynthNativeEventHeaderBack error:', e); }
            })();
            """
        evaluateScriptOnAvailableWebView(script: script)
    }

    @objc private func handleSynthNativeEventHeaderShare(_ notification: Notification) {
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('synthNativeEventHeaderShare'));
                } catch (e) { console.error('SynthNativeEventHeaderShare error:', e); }
            })();
            """
        evaluateScriptOnAvailableWebView(script: script)
    }

    private func evaluateScriptOnAvailableWebView(script: String) {
        let webView: WKWebView? = currentWebView ?? {
            guard let window = availableWindow() else { return nil }
            return findWebView(in: window)
        }()
        guard let wv = webView else { return }
        wv.evaluateJavaScript(script) { _, error in
            if let error = error {
                print("Synth: JavaScript evaluation error: \(error.localizedDescription)")
            }
        }
    }

    private func availableWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
        return windows.first(where: { $0.isKeyWindow }) ?? windows.first
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
        
        // Listen for CapacitorWebView when it appears (after native auth/onboarding)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleCapacitorWebViewReady(_:)),
            name: NSNotification.Name("CapacitorWebViewReady"),
            object: nil
        )
    }
    
    @objc private func handleCapacitorWebViewReady(_ notification: Notification) {
        guard let webView = notification.userInfo?["webView"] as? WKWebView else { return }
        currentWebView = webView
        attachAppHandlers(to: webView)
    }
    
    private var appHandlersAttachedToWebViews = Set<ObjectIdentifier>()

    private func attachAppHandlers(to webView: WKWebView) {
        let id = ObjectIdentifier(webView)
        guard !appHandlersAttachedToWebViews.contains(id) else { return }
        appHandlersAttachedToWebViews.insert(id)
        let config = webView.configuration
        config.userContentController.add(self, name: "appleSignIn")
        config.userContentController.add(self, name: "eventShare")
        config.userContentController.add(self, name: "eventHeader")
        config.userContentController.add(self, name: "setBadgeCount")
        config.userContentController.add(self, name: "synthNativeAuth")
        let script = """
            (function() {
                window.addEventListener('RequestAppleSignIn', function() {
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.appleSignIn) {
                        window.webkit.messageHandlers.appleSignIn.postMessage({});
                    }
                });
                window.addEventListener('RequestEventShare', function(event) {
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.eventShare) {
                        window.webkit.messageHandlers.eventShare.postMessage(event.detail || {});
                    }
                });
                window.setBadgeCount = function(count) {
                    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.setBadgeCount) {
                        window.webkit.messageHandlers.setBadgeCount.postMessage({ count: count });
                    }
                };
            })();
        """
        config.userContentController.addUserScript(
            WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: false)
        )
        print("✅ Apple Sign In / Event Share message handlers attached to CapacitorWebView")
    }
    
    /// Sets up WKWebView message handler to receive JavaScript requests.
    /// Ensures Capacitor's WebView is ready (loadViewIfNeeded) and retries if not yet in hierarchy.
    func setupJavaScriptMessageHandler() {
        func tryAttach(attempt: Int) {
            DispatchQueue.main.async {
                guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let window = windowScene.windows.first else {
                    if attempt < 5 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { tryAttach(attempt: attempt + 1) } }
                    return
                }
                // Ensure Capacitor bridge VC has loaded its view (and thus created the WebView)
                if let bridgeVC = window.rootViewController as? CAPBridgeViewController {
                    bridgeVC.loadViewIfNeeded()
                    if let webView = bridgeVC.webView {
                        self.attachAppHandlers(to: webView)
                        return
                    }
                }
                // Fallback: find WebView in hierarchy (e.g. CapacitorWebView embedded in SwiftUI)
                if let webView = self.findWebView(in: window) {
                    self.attachAppHandlers(to: webView)
                    return
                }
                if attempt < 5 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { tryAttach(attempt: attempt + 1) }
                }
            }
        }
        tryAttach(attempt: 0)
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
        
        // Send token to JavaScript via multiple methods for reliability
        // Method 1: Post notification (handled by NotificationCenter listeners)
        NotificationCenter.default.post(
            name: NSNotification.Name("DeviceTokenReceived"),
            object: nil,
            userInfo: ["token": token]
        )
        
        // Method 2: Dispatch JavaScript event directly to web view
        // Escape token to prevent JavaScript injection if token contains special characters
        let escapedToken = token.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\"", with: "\\\"")
        
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('DeviceTokenReceived', { 
                        detail: { token: '\(escapedToken)' } 
                    }));
                } catch(e) {
                    console.error('Error dispatching DeviceTokenReceived:', e);
                }
            })();
        """
        
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let window = windowScene.windows.first {
                self.evaluateJavaScriptInWebView(script: script, in: window)
            }
        }
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
        // Called when the app was launched with a url (including custom URL schemes like synth://)
        // This handles deep links from Supabase auth callbacks (email confirmation, password reset)
        // ApplicationDelegateProxy forwards the URL to Capacitor, which triggers 'appUrlOpen' event
        // The web layer (App.tsx) listens for this event and processes the auth callback
        // Note: We don't log the full URL to avoid exposing sensitive auth tokens (access_token, refresh_token) in logs
        if url.scheme == "synth" {
            // Only log that a deep link was received, without exposing any URL details that might contain tokens
            print("📱 Received synth:// deep link (auth callback)")
        }
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
                    case .success(let credential):
                        // Send token + (optional) email/fullName to JavaScript
                        self?.sendTokenToWebLayer(
                            token: credential.identityToken,
                            fullName: credential.fullName,
                            email: credential.email
                        )
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
    func sendTokenToWebLayer(token: String, fullName: String? = nil, email: String? = nil) {
        // Escape token for JavaScript (handle quotes and newlines)
        let escapedToken = token.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")

        // Escape optional fields for JavaScript
        let escapedFullName = (fullName ?? "").replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        
        let escapedEmail = (email ?? "").replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        
        // Use JavaScript evaluation to dispatch event to web layer
        let script = """
            (function() {
                try {
                    window.dispatchEvent(new CustomEvent('AppleSignInTokenReceived', { 
                        detail: { token: '\(escapedToken)', fullName: '\(escapedFullName)', email: '\(escapedEmail)' } 
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
            userInfo: ["token": token, "fullName": fullName ?? "", "email": email ?? ""]
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
    
    // MARK: - Event Share Setup
    
    /// Sets up event share listener
    func setupEventShareListener() {
        // Initialize event share handler if iOS 15+
        if #available(iOS 15.0, *) {
            eventShareHandler = EventShareHandler.shared
        }
        
        // Listen for requests from web layer via NotificationCenter (fallback)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleEventShare),
            name: NSNotification.Name("RequestEventShare"),
            object: nil
        )
    }
    
    /// Handles event share request from JavaScript
    @objc func handleEventShare(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let eventData = userInfo["event"] as? [String: Any] else {
            print("Invalid event share data")
            return
        }
        
        // Parse event data
        guard let eventId = eventData["eventId"] as? String,
              let title = eventData["title"] as? String else {
            print("Missing required event fields")
            return
        }
        
        let event = EventShareData(
            eventId: eventId,
            title: title,
            artistName: eventData["artistName"] as? String,
            venueName: eventData["venueName"] as? String,
            venueCity: eventData["venueCity"] as? String,
            eventDate: eventData["eventDate"] as? String,
            imageUrl: eventData["imageUrl"] as? String ?? eventData["posterImageUrl"] as? String,
            posterImageUrl: eventData["posterImageUrl"] as? String
        )
        
        if #available(iOS 15.0, *) {
            presentEventShareModal(event: event)
        }
    }
    
    /// Presents the event share modal
    @available(iOS 15.0, *)
    func presentEventShareModal(event: EventShareData) {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = windowScene.windows.first,
              let rootViewController = window.rootViewController else {
            print("Could not find root view controller")
            return
        }
        
        let handler = EventShareHandler.shared
        
        handler.presentShareModal(
            event: event,
            from: rootViewController,
            onShareExternally: {
                handler.shareExternally(
                    event: event,
                    from: rootViewController,
                    completion: { _ in }
                )
            },
            onShareInChat: {
                handler.shareInChat(event: event) {
                    // Share in chat handled by web layer
                }
            }
        )
    }
    
    // MARK: - WKScriptMessageHandler
    
    /// Receives messages from JavaScript via WKWebView message handler
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "appleSignIn" {
            // Handle Apple Sign In request from JavaScript
            handleAppleSignIn()
        } else if message.name == "eventShare" {
            // Handle Event Share request from JavaScript
            if let eventData = message.body as? [String: Any] {
                let notification = Notification(
                    name: NSNotification.Name("RequestEventShare"),
                    object: nil,
                    userInfo: ["event": eventData]
                )
                handleEventShare(notification: notification)
            }
        } else if message.name == "eventHeader" {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else {
                return
            }
            switch action {
            case "show":
                let title = body["title"] as? String ?? ""
                NativeEventHeaderModel.shared.show(title: title)
            case "hide":
                NativeEventHeaderModel.shared.hide()
            default:
                break
            }
        } else if message.name == "setBadgeCount" {
            // Handle badge count update from JavaScript (matches in-app unread notifications)
            if let data = message.body as? [String: Any],
               let count = data["count"] as? Int {
                DispatchQueue.main.async {
                    UNUserNotificationCenter.current().setBadgeCount(count) { error in
                        if let error = error {
                            print("❌ Failed to set badge count: \(error)")
                        } else {
                            print("✅ Badge count set to: \(count)")
                        }
                    }
                }
            }
        } else if message.name == "synthNativeAuth" {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else {
                return
            }
            switch action {
            case "signedOut":
                handleSynthNativeAuthSignOut(showSuccess: false)
            case "userDeleted":
                handleSynthNativeAuthSignOut(showSuccess: true)
            default:
                break
            }
        }
    }

    private func handleSynthNativeAuthSignOut(showSuccess: Bool) {
        Task {
            do {
                try await AuthService.signOut()
            } catch {
                print("SynthNativeAuth signOut error: \(error)")
            }
            if showSuccess {
                await MainActor.run {
                    AppAuthModel.shared.showAccountDeletedSuccess = true
                }
            }
            NotificationCenter.default.post(
                name: Notification.Name("SynthAuthDidChange"),
                object: nil
            )
        }
    }

}
