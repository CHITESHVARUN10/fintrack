import WidgetKit
import SwiftUI

private let appGroup = "group.com.example.fintrackFlutter"

struct FinStackEntry: TimelineEntry {
    let date: Date
    let month: String
    let income: String
    let outflow: String
    let saved: String
    let updated: String

    static let placeholder = FinStackEntry(
        date: Date(),
        month: "NOVEMBER 2026",
        income: "₹20,000",
        outflow: "₹11,100",
        saved: "₹8,900",
        updated: "Updated 9:41 AM"
    )
}

struct FinStackProvider: TimelineProvider {
    func placeholder(in context: Context) -> FinStackEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (FinStackEntry) -> Void) {
        completion(read())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FinStackEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .after(Date().addingTimeInterval(60 * 30))))
    }

    private func read() -> FinStackEntry {
        let defaults = UserDefaults(suiteName: appGroup)
        return FinStackEntry(
            date: Date(),
            month: defaults?.string(forKey: "finstack_month") ?? "THIS MONTH",
            income: defaults?.string(forKey: "finstack_income") ?? "—",
            outflow: defaults?.string(forKey: "finstack_outflow") ?? "—",
            saved: defaults?.string(forKey: "finstack_saved") ?? "—",
            updated: defaults?.string(forKey: "finstack_updated") ?? "Open FinStack to sync"
        )
    }
}

struct FinStackWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: FinStackEntry

    private var dark: Bool { colorScheme == .dark }
    private var paper: Color {
        dark
            ? Color(red: 0x12 / 255, green: 0x11 / 255, blue: 0x0E / 255)
            : Color(red: 0xFA / 255, green: 0xF5 / 255, blue: 0xE6 / 255)
    }
    private var ink: Color {
        dark
            ? Color(red: 0xF4 / 255, green: 0xEE / 255, blue: 0xDC / 255)
            : Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x0E / 255)
    }
    private var muted: Color {
        dark
            ? Color(red: 0xB7 / 255, green: 0xAD / 255, blue: 0x97 / 255)
            : Color(red: 0x5C / 255, green: 0x59 / 255, blue: 0x4F / 255)
    }
    private let yellow = Color(red: 1, green: 0xE5 / 255, blue: 0)

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text("FINSTACK")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .tracking(1.2)
                    .foregroundColor(ink)
                Spacer(minLength: 6)
                Text(entry.month)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundColor(muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            savedBlock

            HStack(spacing: 12) {
                metric("INCOME", entry.income)
                metric("OUTFLOW", entry.outflow)
            }

            Spacer(minLength: 0)

            Text(entry.updated)
                .font(.system(size: 8, weight: .semibold, design: .monospaced))
                .foregroundColor(muted)
                .lineLimit(1)
        }
        .padding(13)
        .containerBackground(for: .widget) { paper }
        .overlay(
            Rectangle()
                .strokeBorder(ink, lineWidth: 2.5)
        )
    }

    private var savedBlock: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("SAVED THIS MONTH")
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .foregroundColor(Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x0E / 255))
            Text(entry.saved)
                .font(.system(size: family == .systemSmall ? 23 : 27, weight: .heavy, design: .monospaced))
                .foregroundColor(Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x0E / 255))
                .lineLimit(1)
                .minimumScaleFactor(0.55)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(yellow)
        .overlay(
            Rectangle()
                .strokeBorder(Color(red: 0x11 / 255, green: 0x11 / 255, blue: 0x0E / 255), lineWidth: 1.5)
        )
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .foregroundColor(muted)
            Text(value)
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundColor(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@main
struct FinStackWidget: Widget {
    let kind = "FinStackWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FinStackProvider()) { entry in
            FinStackWidgetView(entry: entry)
        }
        .configurationDisplayName("FinStack ledger")
        .description("This month’s income, outflow and saved amount.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}
