import { App, PluginSettingTab, Setting } from 'obsidian';
import type ObsidianToEsa from './main';

export interface EsaSettings {
	esaTeam: string;
	esaToken: string;
	defaultCategory: string;
}

export const DEFAULT_SETTINGS: EsaSettings = {
	esaTeam: '',
	esaToken: '',
	defaultCategory: '',
};

export class EsaSettingTab extends PluginSettingTab {
	plugin: ObsidianToEsa;

	constructor(app: App, plugin: ObsidianToEsa) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Esa.io team name')
			.setDesc('Your esa.io team name (e.g., "myteam" for myteam.esa.io)')
			.addText((text) =>
				text
					.setPlaceholder('Myteam')
					.setValue(this.plugin.settings.esaTeam)
					.onChange(async (value) => {
						this.plugin.settings.esaTeam = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('API token')
			.setDesc('Generate from your esa.io user settings (read + write scope)')
			.addText((text) =>
				text
					.setPlaceholder('Token')
					.setValue(this.plugin.settings.esaToken)
					.onChange(async (value) => {
						this.plugin.settings.esaToken = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Default category')
			.setDesc('Default esa.io category path (e.g., "Obsidian / Imported")')
			.addText((text) =>
				text
					.setPlaceholder('Obsidian / imported')
					.setValue(this.plugin.settings.defaultCategory)
					.onChange(async (value) => {
						this.plugin.settings.defaultCategory = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
