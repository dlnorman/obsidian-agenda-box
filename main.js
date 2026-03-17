'use strict';

var obsidian = require('obsidian');

const VIEW_TYPE_AGENDA = "agenda-view";

// Settings definitions
class AgendaPluginSettings {
    constructor() {
        this.headingText = "Agenda";
    }
}

class AgendaSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Agenda View Settings'});

        new obsidian.Setting(containerEl)
            .setName('Heading text')
            .setDesc('The heading text to look for in notes (without the # symbol)')
            .addText(text => text
                .setPlaceholder('Agenda')
                .setValue(this.plugin.settings.headingText)
                .onChange(async (value) => {
                    this.plugin.settings.headingText = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateAllViews();
                }));
    }
}

class AgendaView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.activeMarkdownView = null;
        this.isEditMode = false;
    }

    getViewType() {
        return VIEW_TYPE_AGENDA;
    }

    getDisplayText() {
        return this.plugin.settings.headingText;
    }

    getIcon() {
        return "list-checks";
    }

    async onOpen() {
        this.contentEl.empty();

        // Create container
        const container = this.contentEl.createDiv('agenda-container');

        // Create header row with buttons
        const headerRow = container.createDiv('agenda-header-row');

        // Create header
        const header = headerRow.createDiv('agenda-header');
        header.textContent = this.plugin.settings.headingText;

        // Button group
        const buttonGroup = headerRow.createDiv('agenda-button-group');

        // Edit toggle button
        this.editToggleButton = buttonGroup.createDiv('agenda-button agenda-secondary-button');
        this.editToggleButton.textContent = "Edit";
        this.editToggleButton.addEventListener('click', () => {
            this.toggleEditMode();
        });

        // Create Convert button
        const convertButton = buttonGroup.createDiv('agenda-button');
        convertButton.textContent = "Create Headings";
        convertButton.addEventListener('click', () => {
            this.convertToHeadings();
        });

        // Rendered markdown display area
        this.renderedContent = container.createDiv('agenda-rendered');
        this.renderedContent.style.display = 'block';

        // Editable textarea (hidden by default)
        this.editableContent = container.createEl('textarea', {
            cls: 'agenda-content',
            attr: {
                placeholder: `No ${this.plugin.settings.headingText.toLowerCase()} found in current note...`
            }
        });
        this.editableContent.style.display = 'none';

        // Listen for content changes with debouncing
        let updateTimer = null;
        const handleInput = () => {
            if (updateTimer) clearTimeout(updateTimer);
            updateTimer = setTimeout(() => {
                this.handleAgendaEdit();
            }, 250);
        };

        this.editableContent.addEventListener('input', handleInput);
        this.editableContent.addEventListener('paste', handleInput);
        this.editableContent.addEventListener('drop', handleInput);

        // Initial content update
        this.updateAgendaContent();
    }

    toggleEditMode() {
        if (this.isEditMode) {
            // Switch to view mode
            this.isEditMode = false;
            this.editToggleButton.textContent = "Edit";
            this.editToggleButton.removeClass('agenda-active-button');
            this.editableContent.style.display = 'none';
            this.renderedContent.style.display = 'block';
            this.renderMarkdown();
        } else {
            // Switch to edit mode
            this.isEditMode = true;
            this.editToggleButton.textContent = "View";
            this.editToggleButton.addClass('agenda-active-button');
            this.renderedContent.style.display = 'none';
            this.editableContent.style.display = 'block';
            this.editableContent.focus();
        }
    }

    setActiveMarkdownView(view) {
        this.activeMarkdownView = view;
        this.updateAgendaContent();
    }

    async updateAgendaContent() {
        if (!this.activeMarkdownView) return;
        // Don't update if textarea is focused (user is editing)
        if (this.isEditMode && this.editableContent === document.activeElement) return;

        const content = this.activeMarkdownView.editor.getValue();
        const {text, start, end} = this.findAgendaSection(content);

        this.editableContent.value = text;
        this.editableContent.dataset.start = start;
        this.editableContent.dataset.end = end;

        if (!this.isEditMode) {
            await this.renderMarkdown();
        }
    }

    async renderMarkdown() {
        if (!this.renderedContent) return;

        this.renderedContent.empty();

        const text = this.editableContent.value;
        if (!text.trim()) {
            this.renderedContent.createEl('p', {
                cls: 'agenda-placeholder',
                text: `No ${this.plugin.settings.headingText.toLowerCase()} found in current note...`
            });
            return;
        }

        const sourcePath = this.activeMarkdownView?.file?.path ?? '';

        try {
            await obsidian.MarkdownRenderer.render(
                this.app,
                text,
                this.renderedContent,
                sourcePath,
                this
            );
        } catch (e) {
            // Fallback for older API
            try {
                await obsidian.MarkdownRenderer.renderMarkdown(
                    text,
                    this.renderedContent,
                    sourcePath,
                    this
                );
            } catch (e2) {
                this.renderedContent.createEl('pre', { text });
            }
        }
    }

    findAgendaSection(content) {
        const headingText = this.plugin.settings.headingText;
        const headingRegex = new RegExp(`^#\\s*${headingText}\\s*$`, 'm');
        const lines = content.split('\n');
        const agendaIndex = lines.findIndex(line => headingRegex.test(line));

        if (agendaIndex === -1) {
            return { text: '', start: -1, end: -1 };
        }

        let endIndex = agendaIndex + 1;
        while (endIndex < lines.length && !lines[endIndex].startsWith('#')) {
            endIndex++;
        }

        const text = lines.slice(agendaIndex + 1, endIndex).join('\n');
        return { text, start: agendaIndex, end: endIndex };
    }

    handleAgendaEdit() {
        if (!this.activeMarkdownView) return;

        const editor = this.activeMarkdownView.editor;
        const doc = editor.getValue();
        const lines = doc.split('\n');
        const text = this.editableContent.value;

        const start = parseInt(this.editableContent.dataset.start);
        const end = parseInt(this.editableContent.dataset.end);

        let newContent;
        if (start === -1) {
            newContent = doc.trim() + '\n\n# ' + this.plugin.settings.headingText + '\n' + text;
        } else {
            const beforeSection = lines.slice(0, start + 1).join('\n');
            const afterSection = lines.slice(end).join('\n');
            newContent = beforeSection + '\n' + text + (afterSection ? '\n' + afterSection : '');
        }

        // Store cursor position
        const cursorPos = this.editableContent.selectionStart;

        editor.setValue(newContent);

        // Update section boundaries
        const {start: newStart, end: newEnd} = this.findAgendaSection(newContent);
        this.editableContent.dataset.start = newStart;
        this.editableContent.dataset.end = newEnd;

        // Restore cursor
        this.editableContent.selectionStart = cursorPos;
        this.editableContent.selectionEnd = cursorPos;
    }

    convertToHeadings() {
        if (!this.activeMarkdownView) return;

        const content = this.editableContent.value;
        if (!content) return;

        const documentContent = this.activeMarkdownView.editor.getValue();
        const { end } = this.findAgendaSection(documentContent);
        const documentLines = documentContent.split('\n');

        const headingsContent = this.isMarkdownTable(content)
            ? this.generateHeadingsFromTable(content)
            : this.generateHeadingsFromList(content.split('\n'));

        const newContent = [
            ...documentLines.slice(0, end),
            '',
            headingsContent,
            ...documentLines.slice(end)
        ].join('\n');

        this.activeMarkdownView.editor.setValue(newContent);
    }

    isMarkdownTable(content) {
        const lines = content.trim().split('\n');
        return lines.length >= 2
            && lines[0].includes('|')
            && /^\|[\s\-:|]+\|/.test(lines[1]);
    }

    generateHeadingsFromTable(content) {
        const lines = content.trim().split('\n').filter(l => l.trim());
        if (lines.length < 3) return '';

        // Parse header row, stripping markdown formatting (bold, italic, etc.)
        // Keep empty cells so column indices align with data rows
        const stripMarkdown = s => s.replace(/\*+/g, '').replace(/_+/g, '').trim();
        const splitCells = line => line.split('|').slice(1, -1).map(c => stripMarkdown(c));
        const headers = splitCells(lines[0]);

        // Find the best column to use as agenda items
        const itemColumnNames = ['item', 'topic', 'agenda item', 'agenda', 'title', 'subject', 'description'];
        let colIndex = headers.findIndex(h => itemColumnNames.includes(h.toLowerCase()));
        if (colIndex < 0) {
            // Default to first non-empty column
            colIndex = headers.findIndex(h => h.length > 0);
            if (colIndex < 0) colIndex = 0;
        }

        // Extract values from data rows (skip header row and separator row)
        const items = [];
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim() || line.trim() === '|') continue;
            const cells = splitCells(line);
            // Strip inline markdown from cell content, collapse <br> to space
            const raw = (cells[colIndex] ?? '').replace(/<br\s*\/?>/gi, ' ').trim();
            if (raw) items.push(raw);
        }

        return items.map(item => '# ' + item).join('\n');
    }

    generateHeadingsFromList(lines) {
        const result = [];

        for (const line of lines) {
            if (!line.trim()) continue;

            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1].length : 0;

            if (indent === 0) {
                const cleanLine = line.trim().replace(/^[-*+]\s+/, '');
                result.push('# ' + cleanLine);
            }
        }

        return result.join('\n');
    }
}

class AgendaPlugin extends obsidian.Plugin {
    async onload() {
        console.log('Loading Agenda plugin');

        this.settings = Object.assign(new AgendaPluginSettings(), await this.loadData());

        this.addSettingTab(new AgendaSettingTab(this.app, this));

        this.registerView(
            VIEW_TYPE_AGENDA,
            (leaf) => new AgendaView(leaf, this)
        );

        this.addRibbonIcon('list-checks', 'Show Agenda', async () => {
            await this.toggleView();
        });

        this.addCommand({
            id: 'show-agenda-view',
            name: 'Show Agenda View',
            callback: async () => {
                await this.toggleView();
            },
            hotkeys: [
                {
                    modifiers: ['Mod', 'Shift'],
                    key: 'a'
                }
            ]
        });

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                if (leaf && leaf.view instanceof obsidian.MarkdownView) {
                    this.updateViews(leaf.view);
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor, view) => {
                if (view instanceof obsidian.MarkdownView) {
                    this.updateViews(view);
                }
            })
        );

        this.addStyle();

        this.app.workspace.onLayoutReady(() => {
            this.initView();
            const activeLeaf = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
            if (activeLeaf) {
                this.updateViews(activeLeaf);
            }
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateAllViews() {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENDA).forEach(leaf => {
            if (leaf.view instanceof AgendaView) {
                leaf.view.updateAgendaContent();
            }
        });
    }

    onunload() {
        console.log('Unloading Agenda plugin');
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENDA);
    }

    async initView() {
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENDA).length === 0) {
            await this.app.workspace.getRightLeaf(false).setViewState({
                type: VIEW_TYPE_AGENDA,
                active: true
            });
        }
    }

    async toggleView() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENDA);
        if (leaves.length === 0) {
            const leaf = this.app.workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_AGENDA,
                active: true
            });
        } else {
            leaves.forEach(leaf => leaf.detach());
        }
    }

    updateViews(markdownView) {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENDA).forEach(leaf => {
            if (leaf.view instanceof AgendaView) {
                leaf.view.setActiveMarkdownView(markdownView);
            }
        });
    }

    addStyle() {
        const style = document.createElement('style');
        style.textContent = `
            .agenda-container {
                padding: 8px;
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            .agenda-header-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
                padding-bottom: 4px;
                border-bottom: 1px solid var(--background-modifier-border);
            }

            .agenda-header {
                font-weight: bold;
            }

            .agenda-button-group {
                display: flex;
                gap: 4px;
            }

            .agenda-button {
                font-size: var(--font-small);
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .agenda-button:hover {
                opacity: 0.9;
            }

            .agenda-secondary-button {
                background-color: var(--background-modifier-border);
                color: var(--text-normal);
            }

            .agenda-active-button {
                background-color: var(--interactive-accent-hover);
                color: var(--text-on-accent);
            }

            .agenda-rendered {
                flex-grow: 1;
                overflow-y: auto;
                padding: 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background-color: var(--background-primary);
                font-size: small;
                line-height: var(--line-height-tight);
            }

            .agenda-rendered p:first-child,
            .agenda-rendered ul:first-child,
            .agenda-rendered ol:first-child,
            .agenda-rendered table:first-child {
                margin-top: 0;
            }

            .agenda-rendered table {
                border-collapse: collapse;
                width: 100%;
            }

            .agenda-rendered th,
            .agenda-rendered td {
                border: 1px solid var(--background-modifier-border);
                padding: 4px 8px;
                text-align: left;
            }

            .agenda-rendered th {
                background-color: var(--background-secondary);
            }

            .agenda-placeholder {
                color: var(--text-muted);
                font-style: italic;
            }

            .agenda-content {
                width: 100%;
                flex-grow: 1;
                padding: 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background-color: var(--background-primary);
                font-family: var(--font-monospace);
                font-size: small;
                line-height: var(--line-height-tight);
                resize: none;
                box-sizing: border-box;
            }

            .agenda-content:focus {
                outline: none;
                border-color: var(--interactive-accent);
            }
        `;
        document.head.appendChild(style);
    }
}

module.exports = AgendaPlugin;
