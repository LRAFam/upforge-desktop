import trainerPin from '../../trainer-version.json'

// The Godot trainer build this app bundles. trainer-version.json is the single pin: release.yml
// downloads this tag, and every run the app syncs is stamped with it.
export const TRAINER_VERSION: string = trainerPin.version
