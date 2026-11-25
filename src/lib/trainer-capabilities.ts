/** Release metadata for the exact bundled trainer artifact; never inferred from a future version. */
export function personalDistanceCapability(pin: { capabilities?: { personalized_distance_v1?: unknown } }): 'v1' | undefined {
  return pin.capabilities?.personalized_distance_v1 === true ? 'v1' : undefined
}
