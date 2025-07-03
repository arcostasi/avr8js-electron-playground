import { describe, expect, it } from 'vitest';
import { buildProjectSessionSnapshot, getRestoredLogWarningKey, resolveProjectSessionRestore } from './app-session';
import {
    DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
    DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
    DEFAULT_UI_TERMINAL_SESSION_STATE,
} from './ui-session';

describe('app-session', () => {
    it('builds a project session snapshot with tabs, terminal state, and buffers', () => {
        const snapshot = buildProjectSessionSnapshot({
            activeFile: 'sketch.ino',
            openFiles: ['sketch.ino', 'diagram.json'],
            sidebarSections: {
                projectsOpen: false,
                editorsOpen: true,
                explorerOpen: false,
            },
            diagnostics: {
                severityFilter: 'warning',
                chipFilter: 'sensor-a',
                expandedIds: ['diag-1'],
            },
            compileHistoryExpandedIds: ['1'],
            dismissedRestoredWarningKey: null,
            tabStripScrollLeft: 96,
            terminal: {
                selectedTab: 'chips',
                autoScroll: false,
                showTimestamps: true,
                lineEnding: '\r\n',
                scrollTop: 180,
                historyScrollTop: 24,
                diagnosticsScrollTop: 12,
            },
            terminalOutputChunks: ['boot\n', 'ready\n'],
            chipOutput: 'chip log\n',
            compileHistory: [{
                id: '1',
                timestamp: 10,
                success: true,
                output: 'ok',
                durationMs: 50,
                projectName: 'demo',
            }],
        });

        expect(snapshot).toEqual({
            activeFile: 'sketch.ino',
            openFiles: ['sketch.ino', 'diagram.json'],
            sidebarSections: {
                projectsOpen: false,
                editorsOpen: true,
                explorerOpen: false,
            },
            diagnostics: {
                severityFilter: 'warning',
                chipFilter: 'sensor-a',
                expandedIds: ['diag-1'],
            },
            restoreContext: {
                preferredTerminalTab: 'diagnostics',
            },
            compileHistoryExpandedIds: ['1'],
            tabStripScrollLeft: 96,
            terminal: {
                selectedTab: 'chips',
                autoScroll: false,
                showTimestamps: true,
                lineEnding: '\r\n',
                scrollTop: 180,
                historyScrollTop: 24,
                diagnosticsScrollTop: 12,
            },
            terminalOutputChunks: ['boot\n', 'ready\n'],
            chipOutput: 'chip log\n',
            compileHistory: [{
                id: '1',
                timestamp: 10,
                success: true,
                output: 'ok',
                durationMs: 50,
                projectName: 'demo',
            }],
        });
    });

    it('restores only valid open tabs and active file from a project session', () => {
        const restored = resolveProjectSessionRestore({
            activeFile: 'diagram.json',
            openFiles: ['sketch.ino', 'diagram.json', 'missing.h'],
            sidebarSections: {
                projectsOpen: true,
                editorsOpen: false,
                explorerOpen: true,
            },
            diagnostics: {
                severityFilter: 'error',
                chipFilter: 'chip-1',
                expandedIds: ['diag-2'],
            },
            restoreContext: {
                preferredTerminalTab: 'diagnostics',
            },
            compileHistoryExpandedIds: ['2', 'missing'],
            dismissedRestoredWarningKey: 'other-warning',
            tabStripScrollLeft: 144,
            terminal: {
                selectedTab: 'history',
                autoScroll: false,
                showTimestamps: true,
                lineEnding: '\r',
                scrollTop: 320,
                historyScrollTop: 640,
                diagnosticsScrollTop: 384,
            },
            terminalOutputChunks: ['a\n', 'b\n'],
            chipOutput: 'chip\n',
            compileHistory: [{
                id: '2',
                timestamp: 20,
                success: false,
                output: 'err',
                durationMs: 40,
                projectName: 'demo',
            }],
            restoredLogWarning: {
                terminalOutput: {
                    truncatedChunks: 5,
                    truncatedChars: 128,
                },
            },
        }, [
            { name: 'sketch.ino' },
            { name: 'diagram.json' },
        ]);

        expect(restored).toEqual({
            openFiles: ['sketch.ino', 'diagram.json'],
            activeFile: 'diagram.json',
            sidebarSections: {
                projectsOpen: true,
                editorsOpen: false,
                explorerOpen: true,
            },
            diagnostics: {
                severityFilter: 'error',
                chipFilter: 'chip-1',
                expandedIds: ['diag-2'],
            },
            restoreContext: {
                preferredTerminalTab: 'diagnostics',
            },
            compileHistoryExpandedIds: ['2'],
            tabStripScrollLeft: 144,
            terminal: {
                selectedTab: 'diagnostics',
                autoScroll: false,
                showTimestamps: true,
                lineEnding: '\r',
                scrollTop: 320,
                historyScrollTop: 640,
                diagnosticsScrollTop: 384,
            },
            terminalOutputChunks: ['a\n', 'b\n'],
            chipOutput: 'chip\n',
            compileHistory: [{
                id: '2',
                timestamp: 20,
                success: false,
                output: 'err',
                durationMs: 40,
                projectName: 'demo',
            }],
            dismissedRestoredWarning: null,
            restoredLogWarning: {
                terminalOutput: {
                    truncatedChunks: 5,
                    truncatedChars: 128,
                },
            },
            restoredLogWarningKey: getRestoredLogWarningKey({
                terminalOutput: {
                    truncatedChunks: 5,
                    truncatedChars: 128,
                },
            }),
        });
    });

    it('falls back to defaults when no session exists for the current project', () => {
        const restored = resolveProjectSessionRestore(undefined, [
            { name: 'sketch.ino' },
            { name: 'diagram.json' },
        ]);

        expect(restored).toEqual({
            openFiles: ['sketch.ino', 'diagram.json'],
            activeFile: null,
            sidebarSections: DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
            diagnostics: DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
            restoreContext: {},
            compileHistoryExpandedIds: [],
            tabStripScrollLeft: 0,
            terminal: DEFAULT_UI_TERMINAL_SESSION_STATE,
            terminalOutputChunks: [],
            chipOutput: '',
            compileHistory: [],
            dismissedRestoredWarning: null,
            restoredLogWarningKey: null,
            restoredLogWarning: null,
        });
    });

    it('marks restored warnings when buffers exceed persistence limits', () => {
        const snapshot = buildProjectSessionSnapshot({
            activeFile: 'sketch.ino',
            openFiles: ['sketch.ino'],
            sidebarSections: DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
            diagnostics: DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
            compileHistoryExpandedIds: [],
            dismissedRestoredWarningKey: null,
            tabStripScrollLeft: 0,
            terminal: DEFAULT_UI_TERMINAL_SESSION_STATE,
            terminalOutputChunks: Array.from({ length: 450 }, (_, index) => `line-${index}\n`),
            chipOutput: 'x'.repeat(300_000),
            compileHistory: [{
                id: '3',
                timestamp: 30,
                success: true,
                output: 'y'.repeat(80_000),
                durationMs: 10,
                projectName: 'demo',
            }],
        });

        expect(snapshot.restoredLogWarning).toEqual({
            terminalOutput: {
                truncatedChunks: 50,
                truncatedChars: Array.from({ length: 50 }, (_, index) => `line-${index}\n`).join('').length,
            },
            chipOutput: {
                truncatedChars: 37_856,
            },
            compileHistory: {
                truncatedEntries: 0,
                truncatedChars: 14_464,
            },
        });
        expect(snapshot.restoreContext).toEqual({
            preferredTerminalTab: 'diagnostics',
        });
        expect(snapshot.dismissedRestoredWarningKey).toBeUndefined();
    });

    it('suppresses restored warning when the same warning was dismissed for the project', () => {
        const warning = {
            chipOutput: {
                truncatedChars: 96,
            },
        };

        const restored = resolveProjectSessionRestore({
            terminal: DEFAULT_UI_TERMINAL_SESSION_STATE,
            compileHistory: [],
            dismissedRestoredWarningKey: getRestoredLogWarningKey(warning),
            restoredLogWarning: warning,
        }, [{ name: 'sketch.ino' }]);

        expect(restored.restoredLogWarningKey).toBe(getRestoredLogWarningKey(warning));
        expect(restored.dismissedRestoredWarning).toEqual(warning);
        expect(restored.restoredLogWarning).toBeNull();
        expect(restored.restoreContext).toEqual({});
        expect(restored.terminal.selectedTab).toBe(DEFAULT_UI_TERMINAL_SESSION_STATE.selectedTab);
    });
});
