import { Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	EsaSettings,
	EsaSettingTab,
} from './settings';
import { registerPostToEsa } from './commands/post-to-esa';

export default class ObsidianToEsa extends Plugin {
	settings!: EsaSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new EsaSettingTab(this.app, this));

		registerPostToEsa(this);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<EsaSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

