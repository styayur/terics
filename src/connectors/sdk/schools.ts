import type { AdapterSupportLevel, ConnectorCapability, ExtractionMethod } from "../../v2/types";

export interface SchoolProfile {
  id: string;
  name: string;
  vendor: string;
  platformVersion?: string;
  entryUrl: string;
  domains: string[];
  status: AdapterSupportLevel;
  capabilities: ConnectorCapability[];
  methods: ExtractionMethod[];
  lastVerifiedAt?: string;
  evidenceUrls?: string[];
  limitations: string[];
}
