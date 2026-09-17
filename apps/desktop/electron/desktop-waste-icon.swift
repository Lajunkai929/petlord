import AppKit
import Foundation

guard CommandLine.arguments.count == 3 else { fputs("Expected file path and waste kind\n", stderr); exit(1) }
let filePath = CommandLine.arguments[1]
let kind = CommandLine.arguments[2]
guard kind == "poop" || kind == "pee" else { fputs("Unknown waste kind\n", stderr); exit(1) }
let image = NSImage(size: NSSize(width: 128, height: 128))
image.lockFocus()
if kind == "poop" {
    let font = NSFont(name: "Apple Color Emoji", size: 102) ?? NSFont.systemFont(ofSize: 102)
    ("💩" as NSString).draw(at: NSPoint(x: 6, y: 4), withAttributes: [.font: font])
} else {
    NSColor(calibratedRed: 0.88, green: 0.63, blue: 0.14, alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 8, y: 25, width: 110, height: 52)).fill()
    NSBezierPath(ovalIn: NSRect(x: 27, y: 19, width: 51, height: 49)).fill()
    NSBezierPath(ovalIn: NSRect(x: 85, y: 78, width: 16, height: 10)).fill()
    NSColor(calibratedRed: 1, green: 0.88, blue: 0.40, alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 25, y: 49, width: 65, height: 14)).fill()
}
image.unlockFocus()
guard NSWorkspace.shared.setIcon(image, forFile: filePath, options: []) else { fputs("AppKit could not attach the custom file icon\n", stderr); exit(2) }
