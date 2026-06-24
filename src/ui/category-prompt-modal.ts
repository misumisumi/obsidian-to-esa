import { App, Modal, Setting } from 'obsidian';

export interface CategoryPromptResult {
	category: string;
	cancelled: boolean;
}

export class CategoryPromptModal extends Modal {
	private result: CategoryPromptResult;
	private inputEl!: HTMLInputElement;
	private resolvePromise!: (value: CategoryPromptResult) => void;

	constructor(
		app: App,
		private initialCategory: string,
	) {
		super(app);
		this.result = { category: initialCategory, cancelled: false };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Post to esa.io' });

		new Setting(contentEl)
			.setName('Category')
			.setDesc('Enter the category path (e.g., "Obsidian / imported")')
			.addText((text) => {
				text
					.setPlaceholder('Category')
					.setValue(this.initialCategory)
					.onChange((value) => {
						this.result.category = value;
					});
				this.inputEl = text.inputEl;
				this.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						this.confirm();
					}
				});
				// Focus and select all
				window.setTimeout(() => {
					this.inputEl.focus();
					this.inputEl.select();
				}, 0);
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Post').setCta().onClick(() => this.confirm()),
			)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.cancel()),
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	openAndAwait(): Promise<CategoryPromptResult> {
		this.open();
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
		});
	}

	private confirm(): void {
		this.result.cancelled = false;
		this.close();
		this.resolvePromise(this.result);
	}

	private cancel(): void {
		this.result.cancelled = true;
		this.close();
		this.resolvePromise(this.result);
	}
}
