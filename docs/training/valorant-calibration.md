# Valorant recording calibration prototype

Open Training Hub → Valorant calibration prototype in the desktop development build.

This is a local manual-annotation workflow, not automatic head detection or extraction of internal game data. It does not read game memory, upload recordings, or change trainer geometry.

## Capture protocol

1. Record a custom-game first-person view with a stationary target near screen centre, a level camera, no ADS and both players on the same flat floor. Keep the complete unstretched frame. Avoid hair and hats as head landmarks.
2. Establish horizontal FOV and target depth along the camera's forward axis independently. A rounded ping or slant-range distance is not automatically this depth. Record the method and its uncertainty. Do not assume the trainer's existing constants are ground truth.
3. Open the recording, seek with the video controls and capture the paused frame. Mark head top, chin and floor contact at the feet. Numeric Y coordinates support fine adjustment; the overlay uses intrinsic video pixels even when displayed smaller.
4. Enter the camera measurements, patch, pose, and setup notes. Save each sample and export before navigating away. Exports embed the captured PNG, timestamps, input annotations and derived bounds. No full video or local absolute path is exported.
5. Repeat at several independently measured distances and with repeated annotations. Compare standing and crouching separately. Independent footage is required to validate results before using them in the trainer.

## Geometry and limitations

For frame width W, height H and horizontal FOV theta:

- focal length in pixels: f = W / (2 tan(theta / 2))
- visible head height: (chinY - topY) * depth / f
- head centre above ground: (feetY - (topY + chinY) / 2) * depth / f
- camera above ground: (feetY - H / 2) * depth / f

The model assumes square pixels, no crop, zero camera pitch, equal floor elevation, and landmarks in one known camera-depth plane. Head shape and pose violate the last assumption to some degree. Unknown camera pitch cannot be recovered from these three landmarks alone. The tool therefore requires an explicit setup confirmation and exports unvalidated measurements.

Bounds are worst-case combinations of user-entered pixel error and distance error; they are not statistical confidence intervals and exclude errors in FOV, pitch, floor elevation and landmark depth. Missing values and undersized heads are rejected. Visual head dimensions do not reveal server headshot boundaries.

Schema version 1 exports `status: unvalidated_visual_measurements`. Keep those files as calibration evidence; they are deliberately not trainer-ready profiles. Future detection can be evaluated against the manually labelled frames without presenting an untested detector as accurate.

## Verification

`npm run type-check`

`npm test -- src/lib/valorant-calibration.test.ts`

`npm run build`

The mathematical tests use a synthetic 2000×1000 frame, 90° HFOV and 10m depth, recovering a 0.2m visual head, 1.7m head centre and 1.6m camera. Repeat the UI flow with a synthetic recording to verify capture, coordinates and saved samples. Real Valorant accuracy remains unverified until calibrated footage is available.
