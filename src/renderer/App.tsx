import React, { useState, useEffect, useCallback, useRef } from 'react';
import ProjectSidebar from '@/components/ProjectSidebar';
import Editor from '@/components/Editor';
import WokwiSimulator from '@/components/simulator';
import SettingsDialog from '@/components/SettingsDialog';
import CommandPalette from '@/components/CommandPalette';
import NewProjectDialog from '@/components/NewProjectDialog';
import type { PaletteCommand } from '@/components/CommandPalette';
import type { NewProjectOptions } from '@/components/NewProjectDialog';
import type { WokwiDiagram, WokwiPart } from '@/types/wokwi.types';
import { parseDiagram } from '@/types/wokwi.types';
import { buildHex } from '../shared/compile';
import {
    discoverProjects, loadProject,
} from '@/services/project-loader';
import {
    exportProject, importProject,
} from '@/services/project-export';
import { useDiagramState } from '@/hooks/useDiagramState';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useResizableLayout } from '@/hooks/useResizableLayout';
import { useProjectStore } from '@/store/projectStore';
import type { CompileHistoryEntry } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import SerialMonitor from '@/components/SerialMonitor';
import {
    FileJson, FileCode2, Terminal as TerminalIcon,
    FolderOpen, PlayCircle, Settings, Save, RotateCcw,
    FilePlus2, FolderPlus, Sun, Moon,
} from 'lucide-react';
import './index.css';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipcRenderer = require('electron').ipcRenderer;

/** Window control buttons extracted to avoid long lines */
function TitlebarButtons() {
    const btnCls = [
        'w-12 h-8 flex items-center justify-center',
        'text-gray-400 hover:bg-[#333] transition-colors',
    ].join(' ');
    const style = {
        WebkitAppRegion: 'no-drag',
    } as React.CSSProperties;
    return (
        <div className="flex" style={style}>
            <button
                onClick={() => ipcRenderer.send('window-minimize')}
                className={btnCls}
            >
                <svg width="10" height="1" viewBox="0 0 10 1">
                    <rect width="10" height="1" fill="currentColor" />
                </svg>
            </button>
            <button
                onClick={() => ipcRenderer.send('window-maximize')}
                className={btnCls}
            >
                <svg width="10" height="10" viewBox="0 0 10 10">
                    <rect
                        width="10" height="10" rx="0"
                        fill="none" stroke="currentColor"
                        strokeWidth="1"
                    />
                </svg>
            </button>
            <button
                onClick={() => ipcRenderer.send('window-close')}
                className={[
                    'w-12 h-8 flex items-center justify-center',
                    'text-gray-400 hover:bg-[#e81123]',
                    'hover:text-white transition-colors',
                ].join(' ')}
            >
                <svg width="10" height="10" viewBox="0 0 10 10">
                    <line
                        x1="0" y1="0" x2="10" y2="10"
                        stroke="currentColor" strokeWidth="1.2"
                    />
                    <line
                        x1="10" y1="0" x2="0" y2="10"
                        stroke="currentColor" strokeWidth="1.2"
                    />
                </svg>
            </button>
        </div>
    );
}

const DEFAULT_CODE = `// Write your Arduino code here
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}`;

const DEFAULT_JSON = `{
  "version": 2,
  "author": "Anonymous maker",
  "editor": "wokwi",
  "parts": [
    { "type": "wokwi-arduino-uno", "id": "uno", "top": 0, "left": 0, "rotate": 0, "attrs": {} }
  ],
  "connections": []
}`;

const DEFAULT_DIAGRAM: WokwiDiagram = parseDiagram(JSON.parse(DEFAULT_JSON));

export default function App() {
    // ── Global Store ──
    const {
        projects, setProjects,
        currentProjectName, currentProjectObj, setCurrentProject,
        files, setFiles,
        activeFile, setActiveFile,
        savedContents, setSavedContents, setSavedContent,
        hex, setHex,
        isCompiling, setIsCompiling,
        terminalOutput, appendTerminalOutput, clearTerminalOutput,
        compileHistory, addCompileHistory, clearCompileHistory,
    } = useProjectStore();

    // ── Settings ──
    const settings = useSettingsStore();
    const [settingsOpen, setSettingsOpen] = useState(false);

    // ── Command Palette ──
    const [paletteOpen, setPaletteOpen] = useState(false);

    // ── New Project Dialog ──
    const [newProjectOpen, setNewProjectOpen] = useState(false);

    // ── Add File inline input ──
    const [addingFile, setAddingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');

    // ── Local Layout State ──
    const [editorVisible, setEditorVisible] = useState(true);
    const [sidebarVisible, setSidebarVisible] = useState(true);
    const [terminalVisible, setTerminalVisible] = useState(true);
    const [simulatorVisible, setSimulatorVisible] = useState(true);

    // ── Diagram State ──
    const {
        diagram, setDiagram, resetDiagram, addPart,
        undo, redo, canUndo, canRedo,
    } = useDiagramState(DEFAULT_DIAGRAM);

    // ── Serial Input ──
    const serialWriteRef = useRef<((text: string) => void) | null>(null);

    // ── Layout Hooks (Declarative Split.js) ──
    useResizableLayout(['#sidebar-pane', '#content-pane'], {
        sizes: [18, 82], minSize: [180, 500], gutterSize: 4, enabled: sidebarVisible
    });

    useResizableLayout(['#editor-area-pane', '#simulator-pane'], {
        sizes: [45, 55], minSize: [300, 400], gutterSize: 4, enabled: editorVisible && simulatorVisible
    });

    useResizableLayout(['#code-pane', '#terminal-pane'], {
        sizes: [75, 25], minSize: [150, 120], gutterSize: 4,
        direction: 'vertical', enabled: editorVisible && terminalVisible,
    });

    // ── Load examples via auto-discovery on startup ──
    useEffect(() => {
        const discovered = discoverProjects();
        if (discovered.length > 0) {
            setProjects(discovered);
            const first = discovered[0];
            const loaded = loadProject(first);
            if (loaded.files.length > 0) {
                setFiles(loaded.files);
                setCurrentProject(loaded.name, first);
                if (loaded.diagram) resetDiagram(loaded.diagram);
                setHex(loaded.hex);
                // Initialise dirty tracking: every file starts clean
                setSavedContents(
                    Object.fromEntries(loaded.files.map(f => [f.name, f.content]))
                );
                const inoFile = loaded.files.find(f => f.name.endsWith('.ino'));
                if (inoFile) setActiveFile(inoFile.name);
            }
        } else {
            // Fallback initialization
            setFiles([
                { name: 'sketch.ino', content: DEFAULT_CODE, language: 'cpp' },
                { name: 'diagram.json', content: DEFAULT_JSON, language: 'json' }
            ]);
            setActiveFile('sketch.ino');
        }
    }, [resetDiagram, setProjects, setCurrentProject, setFiles, setHex, setActiveFile, setSavedContents]);

    // ── Auto-Save Diagram to Disk ──
    useAutoSave({
        diagram,
        projectPath: currentProjectObj?.dirPath || null,
        delay: settings.autoSaveDelay,
        enabled: settings.autoSaveDelay > 0,
    });

    // ── Switch project handler ──
    const handleProjectSelect = useCallback((projectName: string) => {
        const project = projects.find(p => p.name === projectName);
        if (!project) return;
        const loaded = loadProject(project);
        if (loaded.files.length > 0) {
            setFiles(loaded.files);
            setCurrentProject(loaded.name, project);
            if (loaded.diagram) resetDiagram(loaded.diagram);
            setHex(loaded.hex);
            clearTerminalOutput();
            setSavedContents(
                Object.fromEntries(loaded.files.map(f => [f.name, f.content]))
            );
            const inoFile = loaded.files.find(f => f.name.endsWith('.ino'));
            setActiveFile(inoFile ? inoFile.name : loaded.files[0].name);
        }
    }, [projects, resetDiagram, setFiles, setCurrentProject, setHex, clearTerminalOutput, setActiveFile, setSavedContents]);

    // parse diagram from manual diagram.json changes in Monaco editor
    useEffect(() => {
        const diagramFile = files.find(f => f.name === 'diagram.json');
        if (diagramFile && activeFile === 'diagram.json') {
            try {
                const parsed = parseDiagram(JSON.parse(diagramFile.content));
                if (parsed?.parts) setDiagram(parsed);
            } catch {
                // ignore syntax errors while typing
            }
        }
    }, [files, activeFile, setDiagram]);

    const handleCompile = async () => {
        const sketchFile = files.find(f => f.name.endsWith('.ino') || f.name.endsWith('.cpp'))?.content || '';
        // Collect additional source files (.c, .h, .cpp) to send to the compiler
        const extraFiles = files
            .filter(f => /\.(c|h|cpp)$/i.test(f.name))
            .map(f => ({ name: f.name, content: f.content }));
        setIsCompiling(true);
        const startTime = Date.now();

        try {
            let result: { hex: string; stdout: string; stderr: string };

            if (settings.buildBackend === 'local') {
                appendTerminalOutput('Compiling with local arduino-cli...\n');
                const board = currentProjectObj?.board || 'uno';
                const fqbn = settings.fqbnMap[board] || `arduino:avr:${board}`;
                result = await ipcRenderer.invoke('arduino-cli:compile', {
                    source: sketchFile,
                    extraFiles,
                    arduinoCliPath: settings.arduinoCliPath,
                    arduinoCliBin: settings.arduinoCliBin,
                    fqbn,
                    extraFlags: settings.extraFlags,
                });
            } else {
                appendTerminalOutput('Compiling via Hexi cloud...\n');
                result = await buildHex(
                    sketchFile,
                    extraFiles,
                    currentProjectObj?.board || 'uno',
                    {},
                    false,
                    settings.cloudUrl,
                );
            }

            if (result.stderr) appendTerminalOutput('\n' + result.stderr + '\n');
            if (result.stdout) appendTerminalOutput('\n' + result.stdout + '\n');

            const success = Boolean(result.hex);
            if (success) {
                setHex(result.hex);
                appendTerminalOutput('\nCompilation Build Success. Ready to run.\n');
            }

            // Record in compilation history
            const entry: CompileHistoryEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                timestamp: Date.now(),
                success,
                output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
                durationMs: Date.now() - startTime,
                projectName: currentProjectName || '(unnamed)',
            };
            addCompileHistory(entry);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            appendTerminalOutput('\nError: ' + msg + '\n');
            const entry: CompileHistoryEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                timestamp: Date.now(),
                success: false,
                output: msg,
                durationMs: Date.now() - startTime,
                projectName: currentProjectName || '(unnamed)',
            };
            addCompileHistory(entry);
        } finally {
            setIsCompiling(false);
        }
    };

    const handleCodeChange = (newContent: string) => {
        setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: newContent } : f));
    };

    const handleAddComponent = (part: WokwiPart) => {
        addPart(part);
        setFiles(prev => prev.map(f => {
            if (f.name !== 'diagram.json') return f;
            try {
                const parsed = JSON.parse(f.content);
                if (parsed.parts) parsed.parts.push(part);
                return { ...f, content: JSON.stringify(parsed, null, 2) };
            } catch {
                return f;
            }
        }));
    };

    const handleDiagramChange = (newDiagram: WokwiDiagram) => {
        setDiagram(newDiagram);
        setFiles(prev => prev.map(f =>
            f.name === 'diagram.json' ? { ...f, content: JSON.stringify(newDiagram, null, 2) } : f
        ));
    };

    const handleExport = useCallback(async () => {
        const board = currentProjectObj?.board || 'uno';
        const name = currentProjectName || 'project';
        const saved = await exportProject(name, board, files);
        if (saved) appendTerminalOutput(`Exported to ${saved}\n`);
    }, [currentProjectName, currentProjectObj, files, appendTerminalOutput]);

    const handleImport = useCallback(async () => {
        const data = await importProject();
        if (!data) return;
        setFiles(data.files);
        setCurrentProject(data.name, null);
        setSavedContents(
            Object.fromEntries(data.files.map(f => [f.name, f.content]))
        );
        const diagramFile = data.files.find(f => f.name === 'diagram.json');
        if (diagramFile) {
            try {
                const parsed = parseDiagram(JSON.parse(diagramFile.content));
                if (parsed?.parts) resetDiagram(parsed);
            } catch { /* ignore parse errors */ }
        }
        const inoFile = data.files.find(f => f.name.endsWith('.ino'));
        setActiveFile(inoFile ? inoFile.name : data.files[0].name);
        setHex(null);
        clearTerminalOutput();
        appendTerminalOutput(`Imported project: ${data.name}\n`);
    }, [setFiles, setCurrentProject, resetDiagram, setActiveFile, setHex,
        clearTerminalOutput, appendTerminalOutput, setSavedContents]);

    const activeFileData = files.find(f => f.name === activeFile);

    // ── Dirty state helpers ──────────────────────────────────────
    const isFileDirty = useCallback((filename: string) => {
        const f = files.find(x => x.name === filename);
        if (!f) return false;
        // If no saved record yet (e.g. newly added file) treat as dirty
        if (!(filename in savedContents)) return true;
        return f.content !== savedContents[filename];
    }, [files, savedContents]);

    const activeFileDirty = isFileDirty(activeFile);
    const projectPath = currentProjectObj?.dirPath ?? null;

    /** Save one file to disk and mark it clean */
    const handleSaveFile = useCallback(async (filename: string) => {
        if (!projectPath) return;
        const f = files.find(x => x.name === filename);
        if (!f) return;
        // For diagram.json, reuse the existing diagram IPC
        const channel = filename === 'diagram.json'
            ? 'project:save-diagram'
            : 'project:save-file';
        const args = filename === 'diagram.json'
            ? { path: projectPath, content: f.content }
            : { projectPath, filename, content: f.content };
        const result = await ipcRenderer.invoke(channel, args) as { success: boolean; error?: string };
        if (result.success) {
            setSavedContent(filename, f.content);
        } else {
            appendTerminalOutput(`\nFailed to save ${filename}: ${result.error ?? 'unknown error'}\n`);
        }
    }, [projectPath, files, setSavedContent, appendTerminalOutput]);

    /** Restore one file to its last-saved content */
    const handleRestoreFile = useCallback((filename: string) => {
        const saved = savedContents[filename];
        if (saved === undefined) return;
        setFiles(prev => prev.map(f => f.name === filename ? { ...f, content: saved } : f));
        // If restoring diagram.json, also update the diagram state
        if (filename === 'diagram.json') {
            try {
                const parsed = parseDiagram(JSON.parse(saved));
                if (parsed?.parts) setDiagram(parsed);
            } catch { /* ignore */ }
        }
    }, [savedContents, setFiles, setDiagram]);

    /** Ctrl+S — save the active file */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (activeFile) handleSaveFile(activeFile);
            }
            // Ctrl+P — command palette
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                setPaletteOpen(true);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [activeFile, handleSaveFile]);

    /** Determine human-readable language from file extension */
    const langFromExt = (filename: string): string => {
        if (filename.endsWith('.ino') || filename.endsWith('.cpp') || filename.endsWith('.c')) return 'cpp';
        if (filename.endsWith('.h')) return 'cpp';
        if (filename.endsWith('.json')) return 'json';
        return 'plaintext';
    };

    /** Commit a new file in the tab bar */
    const handleAddFileCommit = useCallback(() => {
        const name = newFileName.trim();
        if (!name) { setAddingFile(false); setNewFileName(''); return; }
        // Avoid duplicates
        if (files.find(f => f.name === name)) {
            setAddingFile(false); setNewFileName('');
            setActiveFile(name);
            return;
        }
        const lang = langFromExt(name);
        setFiles(prev => [...prev, { name, content: '', language: lang }]);
        setActiveFile(name);
        setAddingFile(false);
        setNewFileName('');
    }, [newFileName, files, setFiles, setActiveFile]);

    /** Handle new project creation */
    const handleCreateProject = useCallback(async (opts: NewProjectOptions) => {
        const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const appRoot = ipcRenderer.sendSync('get-app-root') as string;

        const blankCode = `// ${opts.name}\nvoid setup() {\n\n}\n\nvoid loop() {\n\n}\n`;
        const blinkCode = `// ${opts.name} — Blink LED\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}\n`;
        const inoContent = opts.template === 'blink' ? blinkCode : blankCode;
        const diagramContent = JSON.stringify({
            version: 2,
            author: 'Anonymous maker',
            editor: 'wokwi',
            parts: [{ type: 'wokwi-arduino-uno', id: 'uno', top: 0, left: 0, rotate: 0, attrs: {} }],
            connections: [],
        }, null, 2);

        const result = await ipcRenderer.invoke('project:create', {
            appRoot,
            category: opts.category,
            slug,
            name: opts.name,
            board: opts.board,
            inoContent,
            diagramContent,
        }) as { success: boolean; dirPath?: string; error?: string };

        if (!result.success) {
            appendTerminalOutput(`\nFailed to create project: ${result.error ?? 'unknown error'}\n`);
        } else {
            appendTerminalOutput(`\nProject "${opts.name}" created at ${result.dirPath}\n`);
            // Rediscover and switch to the new project
            const discovered = discoverProjects();
            setProjects(discovered);
            const newProj = discovered.find(p => p.name === opts.name);
            if (newProj) {
                const loaded = loadProject(newProj);
                setFiles(loaded.files);
                setCurrentProject(loaded.name, newProj);
                if (loaded.diagram) resetDiagram(loaded.diagram);
                setHex(null);
                setSavedContents(Object.fromEntries(loaded.files.map(f => [f.name, f.content])));
                const inoFile = loaded.files.find(f => f.name.endsWith('.ino'));
                setActiveFile(inoFile ? inoFile.name : loaded.files[0]?.name ?? '');
            }
        }
        setNewProjectOpen(false);
    }, [appendTerminalOutput, setProjects, setFiles, setCurrentProject, resetDiagram,
        setHex, setSavedContents, setActiveFile]);

    // ── Command Palette registry ──
    const paletteCommands: PaletteCommand[] = [
        { id: 'compile', label: 'Build / Compile', shortcut: 'F5', action: handleCompile, description: 'Compile sketch' },
        { id: 'settings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => setSettingsOpen(true) },
        { id: 'new-project', label: 'New Project', action: () => setNewProjectOpen(true) },
        { id: 'toggle-editor', label: 'Toggle Code Editor', action: () => setEditorVisible(v => !v) },
        { id: 'toggle-simulator', label: 'Toggle Simulator', action: () => setSimulatorVisible(v => !v) },
        { id: 'toggle-sidebar', label: 'Toggle Explorer Sidebar', action: () => setSidebarVisible(v => !v) },
        { id: 'toggle-terminal', label: 'Toggle Terminal Panel', action: () => setTerminalVisible(v => !v) },
        { id: 'save-file', label: 'Save Active File', shortcut: 'Ctrl+S', action: () => activeFile && handleSaveFile(activeFile) },
        { id: 'restore-file', label: 'Restore Active File', action: () => activeFile && handleRestoreFile(activeFile) },
        { id: 'export', label: 'Export Project', action: handleExport },
        { id: 'import', label: 'Import Project', action: handleImport },
        { id: 'add-file', label: 'Add File to Project', action: () => setAddingFile(true) },
        { id: 'clear-terminal', label: 'Clear Terminal Output', action: clearTerminalOutput },
        { id: 'toggle-theme', label: 'Toggle Light / Dark Theme', action: () => settings.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
    ];

    return (
        <div className={[
            'flex flex-col h-screen bg-vscode-bg',
            'text-vscode-text w-full overflow-hidden font-sans',
            settings.theme === 'light' ? 'theme-light' : '',
        ].join(' ')}>
            {/* ── Titlebar ── */}
            <div
                className={
                    'flex items-center h-9 bg-[#1e1e1e] '
                    + 'border-b border-[#252526] shrink-0 select-none'
                }
                style={
                    { WebkitAppRegion: 'drag' } as React.CSSProperties
                }
            >
                <div className={
                    'flex items-center gap-2 px-3 text-[13px] '
                    + 'text-gray-500 font-medium tracking-wide'
                }>
                    <span className="text-blue-400">⚡</span>
                    {' AVR8js Playground'}
                </div>
                <div className="flex-1" />
                <TitlebarButtons />
            </div>

            {/* ── Main Layout View ── */}
            <div className="flex flex-1 overflow-hidden">
                {/* Global Activity Bar */}
                <div className={
                    'flex flex-col items-center py-4 space-y-4 '
                    + 'w-12 bg-[#333333] border-r '
                    + 'border-[#252526] z-50 shrink-0'
                }>
                    <button
                        onClick={() => setSidebarVisible(v => !v)}
                        className={[
                            'text-vscode-text hover:text-white',
                            'transition-colors',
                            sidebarVisible
                                ? 'text-white border-l-2 border-blue-500'
                                : '',
                        ].join(' ')}
                        title="Toggle Explorer"
                    >
                        <FolderOpen size={24} strokeWidth={1.5} />
                    </button>
                    <button
                        onClick={() => setEditorVisible(v => !v)}
                        className={[
                            'text-vscode-text hover:text-white',
                            'transition-colors',
                            editorVisible ? 'text-white' : '',
                        ].join(' ')}
                        title="Toggle Code Editor"
                    >
                        <FileCode2 size={24} strokeWidth={1.5} />
                    </button>
                    <button
                        onClick={() => setSimulatorVisible(v => !v)}
                        className={[
                            'text-vscode-text hover:text-white',
                            'transition-colors',
                            simulatorVisible ? 'text-white' : '',
                        ].join(' ')}
                        title="Toggle Simulator"
                    >
                        <PlayCircle size={24} strokeWidth={1.5} />
                    </button>
                    {/* Gear / Settings — pinned to bottom */}
                    <div className="flex-1" />
                    {/* New Project */}
                    <button
                        onClick={() => setNewProjectOpen(true)}
                        className="text-vscode-text hover:text-white transition-colors"
                        title="New Project"
                    >
                        <FolderPlus size={22} strokeWidth={1.5} />
                    </button>
                    {/* Theme toggle */}
                    <button
                        onClick={() => settings.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                        className="text-vscode-text hover:text-white transition-colors"
                        title={settings.theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                    >
                        {settings.theme === 'dark'
                            ? <Sun size={20} strokeWidth={1.5} />
                            : <Moon size={20} strokeWidth={1.5} />
                        }
                    </button>
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="text-vscode-text hover:text-white transition-colors"
                        title="Settings"
                    >
                        <Settings size={22} strokeWidth={1.5} />
                    </button>
                </div>

                <div className={
                    'flex flex-row flex-1 overflow-hidden w-full'
                }>
                    {/* Sidebar Pane */}
                    {sidebarVisible && (
                        <div
                            id="sidebar-pane"
                            className="flex flex-col h-full bg-vscode-sidebar"
                        >
                            <ProjectSidebar
                                files={files}
                                activeFile={activeFile}
                                onFileSelect={setActiveFile}
                                projects={projects}
                                currentProject={currentProjectName}
                                onProjectSelect={handleProjectSelect}
                                onExport={handleExport}
                                onImport={handleImport}
                            />
                        </div>
                    )}

                    {/* Content Pane */}
                    <div
                        id="content-pane"
                        className={[
                            'flex flex-row h-full',
                            'overflow-hidden bg-vscode-bg',
                            !sidebarVisible ? 'flex-1 w-full' : '',
                        ].join(' ')}
                    >
                        {/* Editor Layout */}
                        {editorVisible && (
                            <div
                                id="editor-area-pane"
                                className={
                                    'flex flex-col h-full '
                                    + 'border-r border-vscode-border '
                                    + 'bg-vscode-bg'
                                }
                            >
                                <div
                                    id="code-pane"
                                    className={[
                                        'flex flex-col relative',
                                        'overflow-hidden bg-vscode-bg',
                                        !terminalVisible
                                            ? 'flex-1 h-full'
                                            : '',
                                    ].join(' ')}
                                >
                                    <div className={
                                        'flex bg-vscode-sidebar '
                                        + 'border-b border-vscode-border '
                                        + 'shrink-0'
                                    }>
                                        {/* ── Scrollable tab list ── */}
                                        <div className="flex overflow-x-auto no-scrollbar flex-1">
                                            {files.map(file => {
                                                const dirty = isFileDirty(file.name);
                                                return (
                                                    <button
                                                        key={file.name}
                                                        onClick={() => setActiveFile(file.name)}
                                                        className={[
                                                            'flex items-center gap-1.5',
                                                            'px-4 py-2 text-[14px]',
                                                            'border-r border-vscode-border',
                                                            'transition-colors outline-none shrink-0',
                                                            activeFile === file.name
                                                                ? [
                                                                    'bg-vscode-bg',
                                                                    'text-vscode-textActive',
                                                                    'border-t border-t-blue-500',
                                                                ].join(' ')
                                                                : [
                                                                    'bg-vscode-tab',
                                                                    'text-vscode-text',
                                                                    'hover:bg-vscode-bg',
                                                                    'cursor-pointer',
                                                                ].join(' '),
                                                        ].join(' ')}
                                                    >
                                                        {file.name.endsWith('.json')
                                                            ? <FileJson size={14} className="text-yellow-400" />
                                                            : <FileCode2 size={14} className="text-blue-400" />}
                                                        <span>{file.name}</span>
                                                        {/* Dirty indicator dot */}
                                                        {dirty && (
                                                            <span
                                                                className="text-amber-400 leading-none"
                                                                style={{ fontSize: 10 }}
                                                                title="Unsaved changes"
                                                            >●</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* ── Per-file save / restore actions ── */}
                                        <div className="flex items-center gap-0.5 px-2 border-l border-vscode-border shrink-0">
                                            {/* Add file button / inline input */}
                                            {addingFile ? (
                                                <input
                                                    autoFocus
                                                    value={newFileName}
                                                    onChange={e => setNewFileName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleAddFileCommit();
                                                        if (e.key === 'Escape') { setAddingFile(false); setNewFileName(''); }
                                                    }}
                                                    onBlur={handleAddFileCommit}
                                                    placeholder="filename.h"
                                                    className="bg-vscode-input border border-vscode-border text-[12px]
                                                        text-vscode-text px-2 py-0.5 rounded outline-none w-28"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => setAddingFile(true)}
                                                    title="Add new file to project"
                                                    className="flex items-center gap-1 px-2 py-1 rounded text-[12px]
                                                        text-vscode-text opacity-50 hover:opacity-100 hover:bg-vscode-hover transition-colors"
                                                >
                                                    <FilePlus2 size={13} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => activeFile && handleRestoreFile(activeFile)}
                                                disabled={!activeFileDirty}
                                                title="Restore — revert to last saved version (Discard changes)"
                                                className={[
                                                    'flex items-center gap-1 px-2 py-1 rounded text-[12px]',
                                                    'transition-colors',
                                                    activeFileDirty
                                                        ? 'text-amber-400 hover:bg-vscode-hover hover:text-amber-300'
                                                        : 'text-vscode-text opacity-30 cursor-not-allowed',
                                                ].join(' ')}
                                            >
                                                <RotateCcw size={13} />
                                                <span className="hidden sm:inline">Restore</span>
                                            </button>
                                            <button
                                                onClick={() => activeFile && handleSaveFile(activeFile)}
                                                disabled={!activeFileDirty || !projectPath}
                                                title={projectPath ? 'Save file to disk (Ctrl+S)' : 'No project path — cannot save'}
                                                className={[
                                                    'flex items-center gap-1 px-2 py-1 rounded text-[12px]',
                                                    'transition-colors',
                                                    activeFileDirty && projectPath
                                                        ? 'text-blue-400 hover:bg-vscode-hover hover:text-blue-300'
                                                        : 'text-vscode-text opacity-30 cursor-not-allowed',
                                                ].join(' ')}
                                            >
                                                <Save size={13} />
                                                <span className="hidden sm:inline">Save</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 relative overflow-hidden">
                                        {activeFileData && (
                                            <Editor
                                                code={activeFileData.content}
                                                onChange={handleCodeChange}
                                                language={
                                                    activeFileData.language
                                                }
                                                fontSize={settings.editorFontSize}
                                                wordWrap={settings.wordWrap}
                                            />
                                        )}
                                    </div>
                                    {!terminalVisible && (
                                        <button
                                            onClick={() => setTerminalVisible(
                                                true,
                                            )}
                                            className={[
                                                'absolute bottom-4 right-6',
                                                'text-xs bg-vscode-sidebar',
                                                'border border-vscode-border',
                                                'text-vscode-text',
                                                'hover:text-white',
                                                'px-3 py-1.5 rounded-md',
                                                'shadow-lg flex items-center',
                                                'gap-2 font-semibold',
                                                'uppercase z-20',
                                            ].join(' ')}
                                        >
                                            <TerminalIcon size={14} />
                                            {' Show Terminal'}
                                        </button>
                                    )}
                                </div>

                                {terminalVisible && (
                                    <div id="terminal-pane">
                                        <SerialMonitor
                                            output={terminalOutput}
                                            onSend={(text) => {
                                                if (serialWriteRef.current) {
                                                    serialWriteRef.current(text);
                                                    appendTerminalOutput('> ' + text);
                                                }
                                            }}
                                            onClear={clearTerminalOutput}
                                            onHide={() => setTerminalVisible(false)}
                                            compileHistory={compileHistory}
                                            onClearHistory={clearCompileHistory}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Simulator Layout */}
                        {simulatorVisible && (
                            <div
                                id="simulator-pane"
                                className={[
                                    'flex flex-col h-full',
                                    'bg-vscode-bg relative',
                                    !editorVisible
                                        ? 'flex-1 w-full'
                                        : '',
                                ].join(' ')}
                            >
                                <WokwiSimulator
                                    diagram={diagram}
                                    hex={hex}
                                    isCompiling={isCompiling}
                                    onCompile={handleCompile}
                                    onSerialOutput={appendTerminalOutput}
                                    onAddComponent={handleAddComponent}
                                    onDiagramChange={handleDiagramChange}
                                    serialWriteRef={serialWriteRef}
                                    onUndo={undo}
                                    onRedo={redo}
                                    canUndo={canUndo}
                                    canRedo={canRedo}
                                    defaultWireColor={settings.defaultWireColor}
                                    showPinTooltips={settings.showPinTooltips}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Settings Dialog ── */}
            {settingsOpen && (
                <SettingsDialog onClose={() => setSettingsOpen(false)} />
            )}

            {/* ── Command Palette ── */}
            {paletteOpen && (
                <CommandPalette
                    commands={paletteCommands}
                    onClose={() => setPaletteOpen(false)}
                />
            )}

            {/* ── New Project Dialog ── */}
            {newProjectOpen && (
                <NewProjectDialog
                    onConfirm={handleCreateProject}
                    onClose={() => setNewProjectOpen(false)}
                />
            )}
        </div>
    );
}
