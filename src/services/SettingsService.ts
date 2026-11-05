import { BaseDataService } from "./BaseDataService";
import { RepoHealthSettings, DEFAULT_SETTINGS } from "../models/interfaces";
import { HygieneSettings, DEFAULT_HYGIENE_SETTINGS } from "../models/hygieneInterfaces";

const SETTINGS_COLLECTION = "repo-health-settings";
const SETTINGS_DOC_ID = "pr-dashboard-settings";
const HYGIENE_SETTINGS_DOC_ID = "hygiene-settings";

export class SettingsService extends BaseDataService {
  async getSettings(): Promise<RepoHealthSettings> {
    const manager = await this.getDataManager();
    try {
      const doc = await manager.getDocument(SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      return {
        stalePrThresholdDays: doc.stalePrThresholdDays ?? DEFAULT_SETTINGS.stalePrThresholdDays,
        prSizeWarningLines: doc.prSizeWarningLines ?? DEFAULT_SETTINGS.prSizeWarningLines,
        prSizeLargeLines: doc.prSizeLargeLines ?? DEFAULT_SETTINGS.prSizeLargeLines,
        timePeriodDays: doc.timePeriodDays ?? DEFAULT_SETTINGS.timePeriodDays,
        excludedRepoIds: doc.excludedRepoIds ?? DEFAULT_SETTINGS.excludedRepoIds,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: RepoHealthSettings): Promise<void> {
    const manager = await this.getDataManager();
    await manager.setDocument(SETTINGS_COLLECTION, {
      id: SETTINGS_DOC_ID,
      ...settings,
    });
  }

  async getHygieneSettings(): Promise<HygieneSettings> {
    const manager = await this.getDataManager();
    try {
      const doc = await manager.getDocument(SETTINGS_COLLECTION, HYGIENE_SETTINGS_DOC_ID);
      return {
        staleBranchThresholdDays:
          doc.staleBranchThresholdDays ?? DEFAULT_HYGIENE_SETTINGS.staleBranchThresholdDays,
        abandonedRepoThresholdDays:
          doc.abandonedRepoThresholdDays ?? DEFAULT_HYGIENE_SETTINGS.abandonedRepoThresholdDays,
        largeFileSizeMb: doc.largeFileSizeMb ?? DEFAULT_HYGIENE_SETTINGS.largeFileSizeMb,
      };
    } catch {
      return { ...DEFAULT_HYGIENE_SETTINGS };
    }
  }

  async saveHygieneSettings(settings: HygieneSettings): Promise<void> {
    const manager = await this.getDataManager();
    await manager.setDocument(SETTINGS_COLLECTION, {
      id: HYGIENE_SETTINGS_DOC_ID,
      ...settings,
    });
  }
}
