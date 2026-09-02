import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else {
  fputs("usage: remove-checker-background.swift input.png output.png\n", stderr)
  exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])

guard
  let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
  fputs("unable to read input image\n", stderr)
  exit(1)
}

let width = image.width
let height = image.height
let bytesPerPixel = 4
let bytesPerRow = width * bytesPerPixel
var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)

guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
  fputs("unable to create color space\n", stderr)
  exit(1)
}

guard let context = CGContext(
  data: &pixels,
  width: width,
  height: height,
  bitsPerComponent: 8,
  bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("unable to create image context\n", stderr)
  exit(1)
}

context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

let pixelCount = width * height
var candidate = [Bool](repeating: false, count: pixelCount)
var visited = [Bool](repeating: false, count: pixelCount)

for index in 0..<pixelCount {
  let offset = index * bytesPerPixel
  let r = Int(pixels[offset])
  let g = Int(pixels[offset + 1])
  let b = Int(pixels[offset + 2])
  let brightest = max(r, g, b)
  let darkest = min(r, g, b)
  candidate[index] = darkest >= 225 && brightest - darkest <= 18
}

let neighborOffsets = [(-1, 0), (1, 0), (0, -1), (0, 1)]

for start in 0..<pixelCount where candidate[start] && !visited[start] {
  var queue = [start]
  var cursor = 0
  var component: [Int] = []
  var touchesEdge = false
  visited[start] = true

  while cursor < queue.count {
    let index = queue[cursor]
    cursor += 1
    component.append(index)
    let x = index % width
    let y = index / width
    touchesEdge = touchesEdge || x == 0 || x == width - 1 || y == 0 || y == height - 1

    for (dx, dy) in neighborOffsets {
      let nx = x + dx
      let ny = y + dy
      guard nx >= 0, nx < width, ny >= 0, ny < height else { continue }
      let next = ny * width + nx
      guard candidate[next], !visited[next] else { continue }
      visited[next] = true
      queue.append(next)
    }
  }

  if touchesEdge || component.count >= 96 {
    for index in component {
      let offset = index * bytesPerPixel
      pixels[offset] = 0
      pixels[offset + 1] = 0
      pixels[offset + 2] = 0
      pixels[offset + 3] = 0
    }
  }
}

guard let outputContext = CGContext(
  data: &pixels,
  width: width,
  height: height,
  bitsPerComponent: 8,
  bytesPerRow: bytesPerRow,
  space: colorSpace,
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
), let outputImage = outputContext.makeImage() else {
  fputs("unable to create output image\n", stderr)
  exit(1)
}

guard let destination = CGImageDestinationCreateWithURL(
  outputURL as CFURL,
  UTType.png.identifier as CFString,
  1,
  nil
) else {
  fputs("unable to create output destination\n", stderr)
  exit(1)
}

CGImageDestinationAddImage(destination, outputImage, nil)
guard CGImageDestinationFinalize(destination) else {
  fputs("unable to write output image\n", stderr)
  exit(1)
}
