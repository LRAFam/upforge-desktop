import { personalDistanceCapability } from '../../src/lib/trainer-capabilities'
import trainerPin from '../../trainer-version.json'

// The Godot trainer build this app bundles. trainer-version.json is the single pin: release.yml
// downloads this tag, and every run the app syncs is stamped with it.
export const TRAINER_VERSION: string = trainerPin.version

// Set capability metadata only when the pinned release artifact has passed the matching contract.
export const TRAINER_PERSONAL_DISTANCE_CAPABILITY = personalDistanceCapability(trainerPin as { capabilities?: { personalized_distance_v1?: unknown } })
