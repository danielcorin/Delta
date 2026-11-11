#!/usr/bin/env swift
// One vector design for the Icon Composer layers and independently rendered
// legacy PNGs. Run from the repository root with `npm run icon:generate`.
import AppKit
import UniformTypeIdentifiers

let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let root = FileManager.default.currentDirectoryPath
let iconRoot = "\(root)/assets/AppIcon.icon"
let catalogs = "\(root)/assets/Assets.xcassets"
let macSet = "\(catalogs)/AppIcon.appiconset"
let iosSet = "\(catalogs)/AppIcon-iOS.appiconset"
func color(_ hex: UInt32) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}
let gradientTop = color(0x3B7C90)
let gradientBottom = color(0x173E55)
let white = color(0xFFFFFF)

// Coordinates use SVG's top-left origin. The S-shaped river opens into a
// delta/tree canopy, retaining the original icon's defining gesture.
let river = CGMutablePath()
river.move(to: CGPoint(x: 724, y: 802))
river.addCurve(to: CGPoint(x: 553, y: 729), control1: CGPoint(x: 705, y: 773), control2: CGPoint(x: 628, y: 750))
river.addCurve(to: CGPoint(x: 476, y: 649), control1: CGPoint(x: 465, y: 704), control2: CGPoint(x: 448, y: 683))
river.addCurve(to: CGPoint(x: 548, y: 535), control1: CGPoint(x: 506, y: 615), control2: CGPoint(x: 546, y: 589))
river.addCurve(to: CGPoint(x: 519, y: 404), control1: CGPoint(x: 551, y: 483), control2: CGPoint(x: 531, y: 447))
river.addCurve(to: CGPoint(x: 529, y: 268), control1: CGPoint(x: 500, y: 347), control2: CGPoint(x: 510, y: 300))
river.addCurve(to: CGPoint(x: 497, y: 403), control1: CGPoint(x: 495, y: 310), control2: CGPoint(x: 487, y: 353))
river.addCurve(to: CGPoint(x: 520, y: 541), control1: CGPoint(x: 504, y: 451), control2: CGPoint(x: 527, y: 496))
river.addCurve(to: CGPoint(x: 438, y: 629), control1: CGPoint(x: 513, y: 580), control2: CGPoint(x: 477, y: 604))
river.addCurve(to: CGPoint(x: 427, y: 752), control1: CGPoint(x: 374, y: 671), control2: CGPoint(x: 366, y: 718))
river.addCurve(to: CGPoint(x: 440, y: 802), control1: CGPoint(x: 460, y: 770), control2: CGPoint(x: 466, y: 788))
river.closeSubpath()

func branch(_ start: CGPoint, _ c1: CGPoint, _ c2: CGPoint, _ end: CGPoint, width: CGFloat) -> CGPath {
    let line = CGMutablePath()
    line.move(to: start)
    line.addCurve(to: end, control1: c1, control2: c2)
    // Closed outlines prevent Icon Composer from drawing endpoint-closing seams.
    return line.copy(strokingWithWidth: width, lineCap: .round, lineJoin: .round, miterLimit: 4)
}
let branches: [CGPath] = [
    branch(CGPoint(x: 529, y: 548), CGPoint(x: 471, y: 494), CGPoint(x: 353, y: 493), CGPoint(x: 295, y: 446), width: 24),
    branch(CGPoint(x: 530, y: 541), CGPoint(x: 584, y: 490), CGPoint(x: 663, y: 475), CGPoint(x: 704, y: 440), width: 23),
    branch(CGPoint(x: 514, y: 441), CGPoint(x: 459, y: 412), CGPoint(x: 406, y: 357), CGPoint(x: 389, y: 294), width: 21),
    branch(CGPoint(x: 516, y: 431), CGPoint(x: 561, y: 391), CGPoint(x: 595, y: 336), CGPoint(x: 603, y: 296), width: 21),
    branch(CGPoint(x: 410, y: 494), CGPoint(x: 378, y: 465), CGPoint(x: 361, y: 427), CGPoint(x: 361, y: 397), width: 17),
    branch(CGPoint(x: 626, y: 482), CGPoint(x: 648, y: 450), CGPoint(x: 656, y: 413), CGPoint(x: 650, y: 381), width: 17),
]
func leaf(x: CGFloat, y: CGFloat, angle: CGFloat, scale: CGFloat = 1) -> CGPath {
    let path = CGMutablePath()
    path.move(to: CGPoint(x: 0, y: -43))
    path.addCurve(to: CGPoint(x: 0, y: 43), control1: CGPoint(x: 33, y: -21), control2: CGPoint(x: 34, y: 20))
    path.addCurve(to: CGPoint(x: 0, y: -43), control1: CGPoint(x: -34, y: 20), control2: CGPoint(x: -33, y: -21))
    path.closeSubpath()
    var transform = CGAffineTransform(translationX: x, y: y).rotated(by: angle * .pi / 180).scaledBy(x: scale, y: scale)
    return path.copy(using: &transform)!
}
let leaves = [
    leaf(x: 524, y: 232, angle: 13),
    leaf(x: 373, y: 264, angle: -28),
    leaf(x: 613, y: 263, angle: 20),
    leaf(x: 272, y: 420, angle: -48),
    leaf(x: 729, y: 414, angle: 46),
    leaf(x: 358, y: 365, angle: -9, scale: 0.9),
    leaf(x: 642, y: 349, angle: -14, scale: 0.9),
]
let riverPaths = [river as CGPath] + branches
func drawGlyph(_ context: CGContext, in content: CGRect) {
    context.saveGState()
    context.translateBy(x: content.minX, y: content.maxY)
    context.scaleBy(x: content.width / 1024, y: -content.height / 1024)
    context.setFillColor(white)
    for path in riverPaths + leaves { context.addPath(path); context.fillPath() }
    context.restoreGState()
}
func render(pixels: Int, macStyle: Bool) -> CGImage {
    let size = CGFloat(pixels)
    let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8,
        bytesPerRow: 0, space: srgb, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let content: CGRect
    let background: CGPath
    if macStyle {
        let inset = size * 100 / 1024
        content = CGRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
        let radius = content.width * 185 / 824
        background = CGPath(roundedRect: content, cornerWidth: radius, cornerHeight: radius, transform: nil)
        context.saveGState()
        context.setShadow(offset: CGSize(width: 0, height: -size * 0.010), blur: size * 0.022,
            color: CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0.30))
        context.addPath(background); context.setFillColor(gradientBottom); context.fillPath()
        context.restoreGState()
    } else {
        content = CGRect(x: 0, y: 0, width: size, height: size)
        background = CGPath(rect: content, transform: nil)
    }
    context.saveGState(); context.addPath(background); context.clip()
    let gradient = CGGradient(colorsSpace: srgb, colors: [gradientTop, gradientBottom] as CFArray, locations: [0, 1])!
    context.drawLinearGradient(gradient, start: CGPoint(x: content.midX, y: content.maxY), end: CGPoint(x: content.midX, y: content.minY), options: [])
    drawGlyph(context, in: content)
    context.restoreGState()
    return context.makeImage()!
}
func write(_ data: Data, to path: String) {
    let url = URL(fileURLWithPath: path)
    try! FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try! data.write(to: url, options: .atomic)
}
func writeJSON(_ value: Any, to path: String) {
    write(try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]), to: path)
}
func writePNG(_ image: CGImage, to path: String) {
    let data = NSMutableData()
    let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    guard CGImageDestinationFinalize(dest) else { fatalError("Failed to encode \(path)") }
    write(data as Data, to: path)
}
func svgPath(_ path: CGPath) -> String {
    var commands = [String]()
    func point(_ p: CGPoint) -> String { String(format: "%.3f %.3f", Double(p.x), Double(p.y)) }
    path.applyWithBlock { pointer in
        let element = pointer.pointee
        switch element.type {
        case .moveToPoint: commands.append("M " + point(element.points[0]))
        case .addLineToPoint: commands.append("L " + point(element.points[0]))
        case .addQuadCurveToPoint: commands.append("Q " + point(element.points[0]) + " " + point(element.points[1]))
        case .addCurveToPoint: commands.append("C " + point(element.points[0]) + " " + point(element.points[1]) + " " + point(element.points[2]))
        case .closeSubpath: commands.append("Z")
        @unknown default: fatalError("Unexpected path element")
        }
    }
    return "<path fill=\"#FFFFFF\" d=\"\(commands.joined(separator: " "))\"/>"
}
func writeSVG(_ paths: [CGPath], name: String) {
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1024\" height=\"1024\" viewBox=\"0 0 1024 1024\">\n" + paths.map(svgPath).joined(separator: "\n") + "\n</svg>\n"
    write(Data(svg.utf8), to: "\(iconRoot)/Assets/\(name).svg")
}
writeSVG(riverPaths, name: "river")
writeSVG(leaves, name: "canopy")
func group(_ name: String, _ image: String, translucency: Double, shadow: Double) -> [String: Any] {
    ["name": name, "layers": [["name": name, "image-name": image + ".svg", "glass": true]],
     "lighting": "combined", "specular": true,
     "shadow": ["kind": "neutral", "opacity": shadow],
     "translucency": ["enabled": true, "value": translucency]]
}
writeJSON([
    "fill-specializations": [
        ["value": ["automatic-gradient": "extended-srgb:0.18039,0.40784,0.47059,1.00000"]],
        ["appearance": "dark", "value": ["automatic-gradient": "extended-srgb:0.09020,0.22353,0.29412,1.00000"]],
    ],
    "groups": [group("River and branches", "river", translucency: 0.15, shadow: 0.25),
               group("Glass leaves", "canopy", translucency: 0.24, shadow: 0.30)],
    "supported-platforms": ["squares": "shared"],
], to: "\(iconRoot)/icon.json")
for pixels in [16, 32, 64, 128, 256, 512, 1024] {
    writePNG(render(pixels: pixels, macStyle: true), to: "\(macSet)/icon_\(pixels).png")
}
writePNG(render(pixels: 1024, macStyle: false), to: "\(iosSet)/icon_1024.png")
let slots = [16, 32, 128, 256, 512].flatMap { size in [1, 2].map { scale in
    ["filename": "icon_\(size * scale).png", "idiom": "mac", "size": "\(size)x\(size)", "scale": "\(scale)x"]
}}
let info: [String: Any] = ["author": "xcode", "version": 1]
writeJSON(["images": slots, "info": info], to: "\(macSet)/Contents.json")
writeJSON(["images": [["filename": "icon_1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"]], "info": info], to: "\(iosSet)/Contents.json")
writeJSON(["info": info], to: "\(catalogs)/Contents.json")
print("Generated layered river/tree icon and legacy assets.")
