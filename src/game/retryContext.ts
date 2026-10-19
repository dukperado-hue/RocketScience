import { campaign } from '@/campaign/missionManager';
import { PART } from '@/phases/assembly/model/catalog';
import type { PlacedPart } from '@/phases/assembly/model/vehicle';
import type { LaunchContext } from './quickRetry';

/** The Quick Retry context for a launch, the same whichever way the player got to the pad */
export function retryContext(parts: PlacedPart[]): LaunchContext {
  const lantern = parts.some((p) => PART[p.defId].envelope);
  // lanterns start on bare ground, everything else on a rail/ramp (the launch phase picks the exact site)
  return { missionId: campaign.sandbox ? null : campaign.current()?.id ?? null, siteId: 'default', useRail: !lantern };
}
