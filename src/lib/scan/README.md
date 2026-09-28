# Local card identification

The scanner detects each card's connected interior, estimates four clockwise
corners, projects it back to a 63:88 rectangle, and hashes the illustration.
Only the existing 128-bit fingerprints are sent to the matching endpoint.
The catalogue fingerprint format is unchanged; this change needs no reindex.

`rectifyCard` is an original TypeScript implementation of inverse projective
sampling with bilinear interpolation. It has no runtime dependency and also
supports manually selected corners. It validates image dimensions, image bounds,
target dimensions and convex clockwise geometry before sampling.

## Evidence

Run `npx vitest run tests/scan-perspective.test.ts --reporter=verbose`.
The deterministic benchmark uses four smooth synthetic textured cards at
rotations of -12, -8, 8 and 12 degrees. Across 16 samples, mean 128-bit Hamming
distance to the unrotated reference drops from 55.4375 with the old bounding-box
crop to 7.75 after detected-corner rectification. This measures preprocessing
error, not catalogue recognition accuracy. These images are synthetic and omit
glare, sleeves, motion blur, complex printed borders and overlapping cards.

The detector still relies on a connected non-edge card interior and contrasting
background. Strong artwork edges can divide the interior and prevent detection.
Extreme rotation and perspective can defeat the four directional extrema.
Identical artwork across reprints or languages remains ambiguous; the user must
confirm the proposed card. Real-photo rank-1 accuracy has not been measured.

## Primary-source alternatives investigated

- [OpenCV](https://github.com/opencv/opencv),
  [Apache-2.0 license](https://github.com/opencv/opencv/blob/4.x/LICENSE):
  [getPerspectiveTransform and warpPerspective](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html)
  provide general perspective correction. No OpenCV code or WASM bundle is
  included here; the bounded four-corner operation does not need its runtime.
- [Tesseract.js](https://github.com/naptha/tesseract.js),
  [Apache-2.0 license](https://github.com/naptha/tesseract.js/blob/master/LICENSE.md):
  browser OCR can supply printed names or collector numbers to disambiguate
  artwork. It requires a worker, WASM engine and language data. It is not installed
  or represented as working in this scanner; no OCR accuracy or mobile latency
  measurements exist yet.
