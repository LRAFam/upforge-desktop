import packageMetadata from '../../package.json'

// The bare Electron development runner reports its own runtime version through
// app.getVersion(). Product labels and telemetry always use our package version.
export const APP_VERSION = packageMetadata.version
