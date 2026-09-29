import ActivityKit
import SwiftUI
import WidgetKit

/**
 * Instagram's upload Live Activity, in ATTO's black and white:
 * compact: the thumbnail on the left, a ring with the percent on the right.
 * expanded and Lock Screen: thumbnail, the line of text, and the bar; when
 * the upload is paused because ATTO went to the background, a red "!" and
 * "Your post hasn't finished uploading", like Instagram does.
 */
@main
struct AttoPublishWidgets: WidgetBundle {
  var body: some Widget {
    AttoPublishLiveActivity()
  }
}

struct AttoPublishLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AttoPublishAttributes.self) { context in
      LockScreenView(attributes: context.attributes, state: context.state)
        .activityBackgroundTint(Color.black)
        .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Thumb(data: context.attributes.thumbnail, width: 34, height: 60, radius: 8)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          StatusBadge(state: context.state, size: 34)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.state.message)
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(2)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if context.state.phase == "uploading" || context.state.phase == "posting" {
            Bar(progress: context.state.progress)
              .padding(.horizontal, 6)
          }
        }
      } compactLeading: {
        Thumb(data: context.attributes.thumbnail, width: 22, height: 22, radius: 5)
      } compactTrailing: {
        // Instagram keeps the ring in the compact island even while paused;
        // the red "!" only shows once the island is expanded.
        StatusBadge(state: context.state, size: 22, ringWhilePaused: true)
      } minimal: {
        StatusBadge(state: context.state, size: 22, ringWhilePaused: true)
      }
      .widgetURL(URL(string: "atto://"))
      .keylineTint(Color.white)
    }
  }
}

struct LockScreenView: View {
  let attributes: AttoPublishAttributes
  let state: AttoPublishAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      Thumb(data: attributes.thumbnail, width: 34, height: 60, radius: 8)
      VStack(alignment: .leading, spacing: 8) {
        Text(state.message)
          .font(.system(size: 15, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(2)
        if state.phase == "uploading" || state.phase == "posting" {
          Bar(progress: state.progress)
        }
      }
      Spacer(minLength: 0)
      StatusBadge(state: state, size: 34)
    }
    .padding(16)
  }
}

struct Thumb: View {
  let data: Data?
  let width: CGFloat
  let height: CGFloat
  let radius: CGFloat

  var body: some View {
    Group {
      if let data, let image = UIImage(data: data) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        Color.white.opacity(0.15)
      }
    }
    .frame(width: width, height: height)
    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
  }
}

struct StatusBadge: View {
  let state: AttoPublishAttributes.ContentState
  let size: CGFloat
  var ringWhilePaused = false

  var body: some View {
    switch state.phase {
    case "posted":
      Image(systemName: "checkmark.circle.fill")
        .resizable()
        .foregroundColor(.white)
        .frame(width: size, height: size)
    case "paused" where ringWhilePaused:
      Ring(progress: state.progress, size: size)
    case "paused", "failed":
      Image(systemName: "exclamationmark.circle")
        .resizable()
        .foregroundColor(Color(red: 1, green: 0.27, blue: 0.23))
        .frame(width: size, height: size)
    default:
      Ring(progress: state.progress, size: size)
    }
  }
}

struct Ring: View {
  let progress: Double
  let size: CGFloat

  var body: some View {
    let line: CGFloat = size > 26 ? 3.5 : 2.5
    ZStack {
      Circle().stroke(Color.white.opacity(0.25), lineWidth: line)
      Circle()
        .trim(from: 0, to: max(0.02, min(1, progress)))
        .stroke(Color.white, style: StrokeStyle(lineWidth: line, lineCap: .round))
        .rotationEffect(.degrees(-90))
      Text("\(Int((min(1, max(0, progress)) * 100).rounded(.down)))")
        .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
        .foregroundColor(.white)
        .minimumScaleFactor(0.6)
    }
    .frame(width: size, height: size)
  }
}

struct Bar: View {
  let progress: Double

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .leading) {
        Capsule().fill(Color.white.opacity(0.2))
        Capsule().fill(Color.white)
          .frame(width: max(4, geo.size.width * CGFloat(min(1, max(0, progress)))))
      }
    }
    .frame(height: 4)
  }
}
