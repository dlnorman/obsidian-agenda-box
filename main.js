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
        
        // Create header row with button
        const headerRow = container.createDiv('agenda-header-row');
        
        // Create header
        const header = headerRow.createDiv('agenda-header');
        header.textContent = this.plugin.settings.headingText;
        
        // Create Convert button
        const convertButton = headerRow.createDiv('agenda-button');
        convertButton.textContent = "Create Headings";
        convertButton.addEventListener('click', () => {
            this.convertListToHeadings();
        });
        
        // Create editable content area
        this.editableContent = container.createEl('textarea', {
            cls: 'agenda-content',
            attr: { 
                placeholder: `No ${this.plugin.settings.headingText.toLowerCase()} found in current note...` 
            }
        });
        
        // Listen for content changes with debouncing
        let updateTimer = null;
        const handleInput = () => {
            if (updateTimer) {
                clearTimeout(updateTimer);
            }
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

    setActiveMarkdownView(view) {
        this.activeMarkdownView = view;
        this.updateAgendaContent();
    }

    async updateAgendaContent() {
        if (!this.activeMarkdownView || this.editableContent === document.activeElement) {
            return;
        }

        const content = this.activeMarkdownView.editor.getValue();
        const {text, start, end} = this.findAgendaSection(content);
        
        this.editableContent.value = text;
        this.editableContent.dataset.start = start;
        this.editableContent.dataset.end = end;
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
        if (!this.activeMarkdownView) {
            console.log('No active markdown view');
            return;
        }

        const editor = this.activeMarkdownView.editor;
        const doc = editor.getValue();
        const lines = doc.split('\n');
        const text = this.editableContent.value;
        
        const start = parseInt(this.editableContent.dataset.start);
        const end = parseInt(this.editableContent.dataset.end);
        
        let newContent;
        if (start === -1) {
            // If no section exists, create one at the end
            newContent = doc.trim() + '\n\n# ' + this.plugin.settings.headingText + '\n' + text;
        } else {
            // Update existing section
            const beforeSection = lines.slice(0, start + 1).join('\n');
            const afterSection = lines.slice(end).join('\n');
            newContent = beforeSection + '\n' + text + (afterSection ? '\n' + afterSection : '');
        }
        
        // Store cursor position
        const cursorPos = this.editableContent.selectionStart;
        
        // Update the editor
        editor.setValue(newContent);
        
        // Update section boundaries
        const {start: newStart, end: newEnd} = this.findAgendaSection(newContent);
        this.editableContent.dataset.start = newStart;
        this.editableContent.dataset.end = newEnd;
        
        // Restore cursor
        this.editableContent.selectionStart = cursorPos;
        this.editableContent.selectionEnd = cursorPos;
    }
    
    convertListToHeadings() {
        if (!this.activeMarkdownView) return;
        
        const content = this.editableContent.value;
        if (!content) return;
        
        const lines = content.split('\n');
        const documentContent = this.activeMarkdownView.editor.getValue();
        
        // Find the end of the current agenda section to know where to append content
        const { end } = this.findAgendaSection(documentContent);
        const documentLines = documentContent.split('\n');
        
        // Generate headings content
        const headingsContent = this.generateHeadingsFromList(lines);
        
        // Insert after the current agenda section
        const newContent = [
            ...documentLines.slice(0, end),
            '',
            headingsContent,
            ...documentLines.slice(end)
        ].join('\n');
        
        // Update the main document
        this.activeMarkdownView.editor.setValue(newContent);
    }
    
    generateHeadingsFromList(lines) {
        let result = [];
        
        for (const line of lines) {
            // Skip empty lines
            if (!line.trim()) {
                continue;
            }
            
            // Check if this is a top-level item (no indentation)
            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1].length : 0;
            
            // Only process non-indented items
            if (indent === 0) {
                // Remove list markers if present
                const cleanLine = line.trim().replace(/^[-*+]\s+/, '');
                
                // Create H1 heading
                result.push('# ' + cleanLine);
            }
        }
        
        return result.join('\n');
    }
}

class AgendaPlugin extends obsidian.Plugin {
    async onload() {
        console.log('Loading Agenda plugin');

        // Load settings
        this.settings = Object.assign(new AgendaPluginSettings(), await this.loadData());

        // Add settings tab
        this.addSettingTab(new AgendaSettingTab(this.app, this));

        // Register view
        this.registerView(
            VIEW_TYPE_AGENDA,
            (leaf) => new AgendaView(leaf, this)
        );

        // Add ribbon icon
        this.addRibbonIcon('list-checks', 'Show Agenda', async () => {
            await this.toggleView();
        });

        // Add command to toggle view
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

        // Register events for content updates
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

        // Add styles
        this.addStyle();

        // Try to create the view
        this.app.workspace.onLayoutReady(() => {
            this.initView();
            // Set initial active view
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
            
            .agenda-content {
                width: 100%;
                flex-grow: 1;
                padding: 8px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                background-color: var(--background-primary);
                font-family: var(--font-text);
                font-size: small; /* var(--font-small); */
                line-height: var(--line-height-tight);
                resize: none;
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
