import AudioToolbox
import Flutter
import QuickLook
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var reportPreview: ReportPreview?
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let registrar = engineBridge.applicationRegistrar
    let channel = FlutterMethodChannel(
      name: "finstack/payment_feedback",
      binaryMessenger: registrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "playSuccess" else {
        result(FlutterMethodNotImplemented)
        return
      }
      if let sound = self?.paymentSound {
        AudioServicesPlaySystemSound(sound)
      }
      result(nil)
    }
    FlutterMethodChannel(
      name: "finstack/report_preview",
      binaryMessenger: registrar.messenger()
    ).setMethodCallHandler { [weak self] call, result in
      guard call.method == "preview" else {
        result(FlutterMethodNotImplemented)
        return
      }
      self?.previewReport(call.arguments, result: result)
    }
  }

  private func previewReport(_ arguments: Any?, result: @escaping FlutterResult) {
    guard reportPreview == nil,
          let args = arguments as? [String: Any],
          let name = args["name"] as? String,
          name == (name as NSString).lastPathComponent,
          ["pdf", "xlsx"].contains((name as NSString).pathExtension.lowercased()),
          let bytes = (args["bytes"] as? FlutterStandardTypedData)?.data,
          let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive && $0.keyWindow != nil }),
          var presenter = scene.keyWindow?.rootViewController else {
      result(FlutterError(code: "PREVIEW_UNAVAILABLE", message: nil, details: nil))
      return
    }
    while let next = presenter.presentedViewController { presenter = next }
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let file = directory.appendingPathComponent(name)
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      try bytes.write(to: file, options: .atomic)
      guard QLPreviewController.canPreview(file as NSURL) else {
        try? FileManager.default.removeItem(at: directory)
        result(FlutterError(code: "PREVIEW_UNAVAILABLE", message: nil, details: nil))
        return
      }
      let source = ReportPreview(file: file) { [weak self] in
        try? FileManager.default.removeItem(at: directory)
        self?.reportPreview = nil
        result(nil)
      }
      reportPreview = source
      let preview = QLPreviewController()
      preview.dataSource = source
      preview.delegate = source
      presenter.present(preview, animated: true)
    } catch {
      try? FileManager.default.removeItem(at: directory)
      result(FlutterError(code: "PREVIEW_UNAVAILABLE", message: nil, details: nil))
    }
  }

  private lazy var paymentSound: SystemSoundID? = {
    let key = FlutterDartProject.lookupKey(forAsset: "assets/audio/payment_success.wav")
    guard let url = Bundle.main.url(forResource: key, withExtension: nil) else { return nil }
    var sound: SystemSoundID = 0
    return AudioServicesCreateSystemSoundID(url as CFURL, &sound) == kAudioServicesNoError
      ? sound : nil
  }()
}

private final class ReportPreview: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let file: URL
  private let onDismiss: () -> Void

  init(file: URL, onDismiss: @escaping () -> Void) {
    self.file = file
    self.onDismiss = onDismiss
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
    file as NSURL
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    onDismiss()
  }
}
