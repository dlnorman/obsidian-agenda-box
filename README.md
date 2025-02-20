# obsidian-agenda-box
A plugin for Obsidian to let you display and edit a section of a note - say, for meeting agendas, topics, etc., without having to scroll back and forth in a note.

## Installation

This plugin isn't in the main Obsidian Plugins Directory because it's an "AI Slop" project, created with Claude. The Obsidian team has been overrun by AI-generated plugins, so I'm holding back on adding this to their queue until I've been using it for awhile.

Download the `obsidian-agenda-box` folder from Git, unzip it, and copy it into your Obsidian vault at:

`(vault directory)/.obsidian/plugins/`

Then open your Obsidian vault's settings, go to Community Plugins and hit the "refresh" button just above the list of installed plugins. "Agenda Box" should show up. Turn it on.

You should now see a list icon in the far-left ribbon. Click that to enable the Agenda Box tab in the right sidebar. Or hit Command/CTRL+Shift+A to toggle it on/off.

## Warning

I've been using it and it seems to work well. It does edit your notes, so has the potential for some weirdness and maybe even potentially destructive edits (I haven't seen it happen, but it's technically possible). So. Use with caution. Test it out on some notes that you don't care much about before using it "in production".

## Usage

Open a note. Open the sidebar. Turn on the Agenda Box tab if it's not already. If your note already has a section with a heading of \# Agenda it should be displayed in the sidebar. You can edit it directly in the sidebar, and changes will show up in the note. If you don't have an \# Agenda section and start to edit the empty content in the sidebar, it will create the heading in your note before adding the content. If you care about where the section is in your notes, add it manually.

Now, as you work on the main note, the agenda stays pinned in the sidebar. As your note gets longer, you don't have to scroll up and down to keep an eye on the agenda.

## Settings

There is a single setting, to determine which heading the plugin should use for the pinned section. By default, it uses "Agenda", so the \# Agenda header. You can change this to anything you want - any H1 in your note - but it's a global setting for the sidebar, so if you change it, pick something you'll use consistently.