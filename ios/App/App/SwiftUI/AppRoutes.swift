import SwiftUI

enum AppTab: Int, CaseIterable {
    case home
    case discover
    case create
    case chat
    case profile
}

enum AppDestination: Hashable {
    case homeFeed
    case discover
    case chat
    case profile
    case auth
    case notifications
    case profileEdit
    case streamingStats
    case spotifyCallback
    case artistEvents
    case venueEvents
    case artistVenueFollowing
    case creatorAnalytics
    case businessAnalytics
    case adminAnalytics
    case eventsManagement
    case onboardingFlow
    case onboardingTour
    case admin
    case allPages
}

enum AppModal: Identifiable {
    case eventDetails
    case eventReview
    case settings
    case reviewDetail

    var id: String {
        switch self {
        case .eventDetails: return "eventDetails"
        case .eventReview: return "eventReview"
        case .settings: return "settings"
        case .reviewDetail: return "reviewDetail"
        }
    }
}

struct AppPage: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let description: String
    let destination: AppDestination?
    let modal: AppModal?
    let titleStyle: SynthTextStyle

    init(
        title: String,
        description: String,
        destination: AppDestination,
        titleStyle: SynthTextStyle = .h2
    ) {
        self.title = title
        self.description = description
        self.destination = destination
        self.modal = nil
        self.titleStyle = titleStyle
    }

    init(
        title: String,
        description: String,
        modal: AppModal,
        titleStyle: SynthTextStyle = .h2
    ) {
        self.title = title
        self.description = description
        self.destination = nil
        self.modal = modal
        self.titleStyle = titleStyle
    }
}
