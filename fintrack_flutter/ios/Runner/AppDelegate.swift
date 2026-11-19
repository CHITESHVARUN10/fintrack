import AudioToolbox
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
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
  }

  private lazy var paymentSound: SystemSoundID? = {
    let key = FlutterDartProject.lookupKey(forAsset: "assets/audio/payment_success.wav")
    guard let url = Bundle.main.url(forResource: key, withExtension: nil) else { return nil }
    var sound: SystemSoundID = 0
    return AudioServicesCreateSystemSoundID(url as CFURL, &sound) == kAudioServicesNoError
      ? sound : nil
  }()
}
