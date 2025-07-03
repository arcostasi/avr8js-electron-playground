import { beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
    DEFAULT_UI_LAYOUT_STATE,
    DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
    DEFAULT_UI_TERMINAL_SESSION_STATE,
    normalizeProjectSessionKey,
    readUiSession,
    resetUiSessionForTests,
    updateUiSession,
} from './ui-session';

function createStorageMock(): Storage {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.get(key) ?? null;
        },
        key(index: number) {
            return [...store.keys()][index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    };
}

describe('ui-session', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: createStorageMock(),
            configurable: true,
            writable: true,
        });
        localStorage.clear();
        resetUiSessionForTests();
    });

    it('returns the default layout and empty project sessions when nothing is persisted', async () => {
        const session = await readUiSession();

        expect(session.version).toBe(1);
        expect(session.layout).toEqual(DEFAULT_UI_LAYOUT_STATE);
        expect(session.projects).toEqual({});
    });

    it('sanitizes invalid persisted session payloads', async () => {
        localStorage.setItem('persist:ui-session:state-v1.json', JSON.stringify({
            version: 999,
            layout: {
                sidebarVisible: 'yes',
                editorVisible: false,
                terminalVisible: true,
                simulatorVisible: null,
                sidebarContentSizes: ['bad', 82],
                editorSimulatorSizes: [40, 60],
                codeTerminalSizes: [75, 'bad'],
            },
            projects: {
                demo: {
                    activeFile: 123,
                    openFiles: ['sketch.ino', 7, 'diagram.json', 'sketch.ino'],
                    sidebarSections: {
                        projectsOpen: false,
                        editorsOpen: 'yes',
                        explorerOpen: true,
                    },
                    diagnostics: {
                        severityFilter: 'warning',
                        chipFilter: '',
                        expandedIds: ['diag-1', 9, 'diag-1'],
                    },
                    restoreContext: {
                        preferredTerminalTab: 'diagnostics',
                    },
                    compileHistoryExpandedIds: ['1', 4, '1'],
                    dismissedRestoredWarningKey: 'warning-1',
                    tabStripScrollLeft: -5,
                    terminal: {
                        selectedTab: 'unknown',
                        autoScroll: 'yes',
                        showTimestamps: true,
                        lineEnding: '\r\n',
                        scrollTop: -1,
                        historyScrollTop: 42,
                        diagnosticsScrollTop: 21,
                    },
                    terminalOutputChunks: [5, '', 'tail\n'],
                    chipOutput: 'chip tail',
                    compileHistory: [{
                        id: '1',
                        timestamp: 10,
                        success: true,
                        output: 'ok',
                        durationMs: 30,
                        projectName: 'demo',
                    }],
                    restoredLogWarning: {
                        terminalOutput: {
                            truncatedChunks: 4,
                            truncatedChars: 80,
                        },
                        compileHistory: {
                            truncatedEntries: 2,
                            truncatedChars: 'yes',
                        },
                    },
                },
            },
        }));

        const session = await readUiSession();

        expect(session.layout.sidebarVisible).toBe(DEFAULT_UI_LAYOUT_STATE.sidebarVisible);
        expect(session.layout.editorVisible).toBe(false);
        expect(session.layout.sidebarContentSizes).toEqual(DEFAULT_UI_LAYOUT_STATE.sidebarContentSizes);
        expect(session.layout.editorSimulatorSizes).toEqual([40, 60]);
        expect(session.layout.codeTerminalSizes).toEqual(DEFAULT_UI_LAYOUT_STATE.codeTerminalSizes);
        expect(session.projects.demo).toEqual({
            openFiles: ['sketch.ino', 'diagram.json'],
            sidebarSections: {
                projectsOpen: false,
                editorsOpen: DEFAULT_UI_SIDEBAR_SECTIONS_STATE.editorsOpen,
                explorerOpen: true,
            },
            diagnostics: {
                severityFilter: 'warning',
                chipFilter: DEFAULT_UI_DIAGNOSTICS_SESSION_STATE.chipFilter,
                expandedIds: ['diag-1'],
            },
            restoreContext: {
                preferredTerminalTab: 'diagnostics',
            },
            compileHistoryExpandedIds: ['1'],
            dismissedRestoredWarningKey: 'warning-1',
            terminal: {
                ...DEFAULT_UI_TERMINAL_SESSION_STATE,
                showTimestamps: true,
                lineEnding: '\r\n',
                historyScrollTop: 42,
                diagnosticsScrollTop: 21,
            },
            terminalOutputChunks: ['tail\n'],
            chipOutput: 'chip tail',
            compileHistory: [{
                id: '1',
                timestamp: 10,
                success: true,
                output: 'ok',
                durationMs: 30,
                projectName: 'demo',
            }],
            restoredLogWarning: {
                terminalOutput: {
                    truncatedChunks: 4,
                    truncatedChars: 80,
                },
                compileHistory: {
                    truncatedEntries: 2,
                    truncatedChars: 0,
                },
            },
        });
    });

    it('persists active file, open tabs, tab strip scroll, and terminal view state', async () => {
        const projectKey = normalizeProjectSessionKey(String.raw`D:\Code\Demo`);

        const updated = await updateUiSession((draft) => {
            draft.layout.sidebarVisible = false;
            draft.layout.codeTerminalSizes = [68, 32];
            draft.projects[projectKey] = {
                activeFile: 'sketch.ino',
                openFiles: ['sketch.ino', 'diagram.json'],
                sidebarSections: {
                    projectsOpen: false,
                    editorsOpen: true,
                    explorerOpen: false,
                },
                diagnostics: {
                    severityFilter: 'error',
                    chipFilter: 'chip-z',
                    expandedIds: ['diag-2'],
                },
                restoreContext: {
                    preferredTerminalTab: 'diagnostics',
                },
                compileHistoryExpandedIds: ['2'],
                dismissedRestoredWarningKey: 'warning-2',
                tabStripScrollLeft: 144,
                terminal: {
                    selectedTab: 'history',
                    autoScroll: false,
                    showTimestamps: true,
                    lineEnding: '\r',
                    scrollTop: 320,
                    historyScrollTop: 512,
                    diagnosticsScrollTop: 288,
                },
                terminalOutputChunks: ['boot\n', 'ready\n'],
                chipOutput: 'chip log\n',
                compileHistory: [{
                    id: '2',
                    timestamp: 20,
                    success: false,
                    output: 'err',
                    durationMs: 44,
                    projectName: 'demo',
                }],
                restoredLogWarning: {
                    chipOutput: {
                        truncatedChars: 96,
                    },
                },
            };
        });

        expect(updated.layout.sidebarVisible).toBe(false);
        expect(updated.layout.codeTerminalSizes).toEqual([68, 32]);
        expect(updated.projects[projectKey]).toEqual({
            activeFile: 'sketch.ino',
            openFiles: ['sketch.ino', 'diagram.json'],
            sidebarSections: {
                projectsOpen: false,
                editorsOpen: true,
                explorerOpen: false,
            },
            diagnostics: {
                severityFilter: 'error',
                chipFilter: 'chip-z',
                expandedIds: ['diag-2'],
            },
            restoreContext: {
                preferredTerminalTab: 'diagnostics',
            },
            compileHistoryExpandedIds: ['2'],
            dismissedRestoredWarningKey: 'warning-2',
            tabStripScrollLeft: 144,
            terminal: {
                selectedTab: 'history',
                autoScroll: false,
                showTimestamps: true,
                lineEnding: '\r',
                scrollTop: 320,
                historyScrollTop: 512,
                diagnosticsScrollTop: 288,
            },
            terminalOutputChunks: ['boot\n', 'ready\n'],
            chipOutput: 'chip log\n',
            compileHistory: [{
                id: '2',
                timestamp: 20,
                success: false,
                output: 'err',
                durationMs: 44,
                projectName: 'demo',
            }],
            restoredLogWarning: {
                chipOutput: {
                    truncatedChars: 96,
                },
            },
        });

        resetUiSessionForTests();
        const reloaded = await readUiSession();
        expect(reloaded).toEqual(updated);
    });

    it('normalizes project keys for stable per-project session storage', () => {
        expect(normalizeProjectSessionKey(String.raw`D:\Code\JS\Example`)).toBe('d:/code/js/example');
        expect(normalizeProjectSessionKey(' d:/Code/JS/Example ')).toBe('d:/code/js/example');
    });
});
