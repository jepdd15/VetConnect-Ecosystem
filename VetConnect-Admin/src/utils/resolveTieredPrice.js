/**
 * Resolves the correct price for a service given a pet's weight.
 * Returns the flat `price` when:
 *  - hasTieredPricing is false/undefined
 *  - no tiers are defined
 *  - petWeight is null/undefined (weight unavailable)
 *  - no tier matches the given weight
 *
 * Tier matching:
 *  - minWeight <= petWeight <= maxWeight
 *  - if maxWeight === 0, it is treated as "no upper limit" (last tier)
 */
export function resolveTieredPrice(service, petWeight) {
  if (!service) return 0;
  if (!service.hasTieredPricing || !service.pricingTiers?.length) {
    return service.price || 0;
  }
  if (petWeight == null || isNaN(Number(petWeight))) {
    return service.price || 0; // fallback when weight unknown
  }
  const w = Number(petWeight);
  for (const tier of service.pricingTiers) {
    const min = Number(tier.minWeight) || 0;
    const max = Number(tier.maxWeight) || 0;
    const inRange = w >= min && (max === 0 || w <= max);
    if (inRange) return Number(tier.price) || service.price || 0;
  }
  return service.price || 0; // no tier matched, use flat price
}
