import { FredAdapter } from "../fred/FredClient.js";
import { DgbasAdapter } from "../dgbas/DgbasClient.js";
import { EiaAdapter } from "../eia/EiaClient.js";
import { ResearchFileAdapter } from "../research/ResearchFileAdapter.js";
import { DataAcquisitionService } from "./DataAcquisitionService.js";
import { indicatorSources } from "./indicatorSources.js";

export function createAcquisitionService({
  fredOptions,
  dgbasOptions,
  eiaOptions,
  researchOptions,
  adapters,
  sourceConfigs = indicatorSources,
} = {}) {
  const researchAdapter = new ResearchFileAdapter(researchOptions);
  return new DataAcquisitionService({
    adapters: adapters ?? {
      FRED: new FredAdapter(fredOptions),
      DGBAS: new DgbasAdapter(dgbasOptions),
      EIA: new EiaAdapter(eiaOptions),
      CALDARA_IACOVIELLO: researchAdapter,
      POLICY_UNCERTAINTY: researchAdapter,
      NY_FED: researchAdapter,
    },
    sourceConfigs,
  });
}
