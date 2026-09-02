import CoreImage
import Foundation
import Vision

enum MaskerError: Error, CustomStringConvertible {
    case invalidArguments
    case noForeground(String)

    var description: String {
        switch self {
        case .invalidArguments:
            return "Usage: ForegroundMasker <input-directory> <output-directory>"
        case .noForeground(let filename):
            return "No foreground subject detected in \(filename)"
        }
    }
}

@available(macOS 14.0, *)
func createMask(inputURL: URL, outputURL: URL, context: CIContext) throws {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(url: inputURL, orientation: .up, options: [:])
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
        throw MaskerError.noForeground(inputURL.lastPathComponent)
    }
    let pixelBuffer = try observation.generateScaledMaskForImage(
        forInstances: observation.allInstances,
        from: handler
    )
    let mask = CIImage(cvPixelBuffer: pixelBuffer)
    try context.writePNGRepresentation(
        of: mask,
        to: outputURL,
        format: .L8,
        colorSpace: CGColorSpaceCreateDeviceGray()
    )
}

do {
    guard CommandLine.arguments.count == 3 else { throw MaskerError.invalidArguments }
    guard #available(macOS 14.0, *) else {
        throw NSError(domain: "ForegroundMasker", code: 14, userInfo: [NSLocalizedDescriptionKey: "Apple Vision foreground masks require macOS 14 or later."])
    }
    let inputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
    try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
    let inputs = try FileManager.default.contentsOfDirectory(
        at: inputDirectory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
    ).filter { $0.pathExtension.lowercased() == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    let context = CIContext(options: [.useSoftwareRenderer: false])
    for input in inputs {
        let output = outputDirectory.appendingPathComponent(input.lastPathComponent)
        try createMask(inputURL: input, outputURL: output, context: context)
    }
    print("MASKED \(inputs.count)")
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
