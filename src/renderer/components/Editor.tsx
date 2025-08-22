import React, { useRef, useEffect } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { EditorDiagnostic } from '../types/editor-diagnostics';
import { measureAsync, measureSync, startPerfMeasure } from '../utils/perf';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

const monacoGlobal = globalThis as typeof globalThis & {
    MonacoEnvironment: {
        getWorker(workerId: string, label: string): Worker;
    };
};

monacoGlobal.MonacoEnvironment = {
    getWorker() {
        return new editorWorker();
    }
};

// ── Custom Editor Themes ──
let themeRegistered = false;

function getThemeName(): string {
    return document.documentElement.classList.contains('theme-light')
        ? 'wokwi-light'
        : 'wokwi-dark';
}

function ensureTheme() {
    if (themeRegistered) return;
    themeRegistered = true;

    monaco.editor.defineTheme('wokwi-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            // Comments — muted gray, italic
            { token: 'comment', foreground: '808080', fontStyle: 'italic' },
            { token: 'comment.line', foreground: '808080', fontStyle: 'italic' },
            { token: 'comment.block', foreground: '808080', fontStyle: 'italic' },

            // Keywords — orange/amber bold (void, if, else, return, for, while)
            { token: 'keyword', foreground: 'cc7832', fontStyle: 'bold' },
            { token: 'keyword.control', foreground: 'cc7832', fontStyle: 'bold' },
            { token: 'keyword.operator', foreground: 'cc7832' },

            // Preprocessor — olive/yellow-green (#define, #include)
            { token: 'keyword.directive', foreground: 'bbb529' },
            { token: 'keyword.directive.cpp', foreground: 'bbb529' },

            // Types — orange like keywords (int, char, long, unsigned, bool)
            { token: 'type', foreground: 'cc7832', fontStyle: 'bold' },
            { token: 'type.identifier', foreground: 'cc7832' },
            { token: 'storage.type', foreground: 'cc7832' },

            // Functions — warm yellow
            { token: 'entity.name.function', foreground: 'ffc66d' },
            { token: 'support.function', foreground: 'ffc66d' },

            // Numbers — cyan/blue
            { token: 'number', foreground: '6897bb' },
            { token: 'number.hex', foreground: '6897bb' },
            { token: 'number.float', foreground: '6897bb' },

            // Strings — olive green
            { token: 'string', foreground: '6a8759' },
            { token: 'string.escape', foreground: 'cc7832' },

            // Identifiers / variables / constants — warm yellow
            { token: 'identifier', foreground: 'e8bf6a' },
            { token: 'variable', foreground: 'e8bf6a' },

            // Operators & delimiters — soft gray-blue
            { token: 'delimiter', foreground: 'a9b7c6' },
            { token: 'operator', foreground: 'a9b7c6' },
            { token: 'delimiter.bracket', foreground: 'a9b7c6' },
            { token: 'delimiter.parenthesis', foreground: 'a9b7c6' },

            // JSON tokens
            { token: 'string.key.json', foreground: 'cc7832' },
            { token: 'string.value.json', foreground: '6a8759' },
            { token: 'number.json', foreground: '6897bb' },
            { token: 'keyword.json', foreground: 'cc7832' },
        ],
        colors: {
            'editor.background': '#2b2b2b',
            'editor.foreground': '#a9b7c6',
            'editorCursor.foreground': '#bbbbbb',
            'editor.lineHighlightBackground': '#323232',
            'editor.selectionBackground': '#214283',
            'editorLineNumber.foreground': '#606366',
            'editorLineNumber.activeForeground': '#a4a3a3',
            'editorIndentGuide.background': '#373737',
            'editorIndentGuide.activeBackground': '#505050',
            'editorGutter.background': '#2b2b2b',
            'editor.selectionHighlightBackground': '#32593d',

            'scrollbar.shadow': '#00000030',
            'scrollbarSlider.background': '#4e566680',
            'scrollbarSlider.hoverBackground': '#5a637580',
            'scrollbarSlider.activeBackground': '#747d9180',

            'editorWidget.background': '#3c3f41',
            'editorWidget.border': '#515151',
            'editorSuggestWidget.background': '#3c3f41',
            'editorSuggestWidget.border': '#515151',
            'editorSuggestWidget.selectedBackground': '#0d293e',

            'minimap.background': '#2b2b2b',
        }
    });

    monaco.editor.defineTheme('wokwi-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment',              foreground: '7a7a7a', fontStyle: 'italic' },
            { token: 'comment.line',          foreground: '7a7a7a', fontStyle: 'italic' },
            { token: 'comment.block',         foreground: '7a7a7a', fontStyle: 'italic' },
            { token: 'keyword',               foreground: '7b5ea7', fontStyle: 'bold' },
            { token: 'keyword.control',       foreground: '7b5ea7', fontStyle: 'bold' },
            { token: 'keyword.operator',      foreground: '7b5ea7' },
            { token: 'keyword.directive',     foreground: '507a00' },
            { token: 'keyword.directive.cpp', foreground: '507a00' },
            { token: 'type',                  foreground: '7b5ea7', fontStyle: 'bold' },
            { token: 'type.identifier',       foreground: '7b5ea7' },
            { token: 'storage.type',          foreground: '7b5ea7' },
            { token: 'entity.name.function',  foreground: '795e26' },
            { token: 'support.function',      foreground: '795e26' },
            { token: 'number',                foreground: '098658' },
            { token: 'number.hex',            foreground: '098658' },
            { token: 'number.float',          foreground: '098658' },
            { token: 'string',                foreground: 'a31515' },
            { token: 'string.escape',         foreground: 'ff0000' },
            { token: 'identifier',            foreground: '001080' },
            { token: 'variable',              foreground: '001080' },
            { token: 'delimiter',             foreground: '383838' },
            { token: 'operator',              foreground: '383838' },
            { token: 'string.key.json',       foreground: '0451a5' },
            { token: 'string.value.json',     foreground: 'a31515' },
            { token: 'number.json',           foreground: '098658' },
            { token: 'keyword.json',          foreground: '7b5ea7' },
        ],
        colors: {
            'editor.background':                   '#f5f5f5',
            'editor.foreground':                   '#383838',
            'editorCursor.foreground':             '#333333',
            'editor.lineHighlightBackground':      '#ebebeb',
            'editor.selectionBackground':          '#add6ff',
            'editorLineNumber.foreground':         '#aaaaaa',
            'editorLineNumber.activeForeground':   '#666666',
            'editorIndentGuide.background':        '#d3d3d3',
            'editorIndentGuide.activeBackground':  '#bbbbbb',
            'editorGutter.background':             '#f5f5f5',
            'editor.selectionHighlightBackground': '#b3d4cc',
            'scrollbar.shadow':                    '#00000018',
            'scrollbarSlider.background':          '#c8c8c880',
            'scrollbarSlider.hoverBackground':     '#b0b0b080',
            'scrollbarSlider.activeBackground':    '#909090aa',
            'editorWidget.background':             '#e8e8e8',
            'editorWidget.border':                 '#cccccc',
            'editorSuggestWidget.background':      '#e8e8e8',
            'editorSuggestWidget.border':          '#cccccc',
            'editorSuggestWidget.selectedBackground': '#d0e8ff',
            'minimap.background':                  '#f5f5f5',
        }
    });
}

interface EditorProps {
    fileKey: string;
    code: string;
    onChange?: (val: string) => void;
    language?: string;
    fontSize?: number;
    wordWrap?: 'on' | 'off';
    diagnostics?: EditorDiagnostic[];
    revealPosition?: {
        lineNumber: number;
        column: number;
        token: number;
    };
}

const MAX_EDITOR_MODELS = 24;
const modelCache = new Map<string, monaco.editor.ITextModel>();
const modelLastUsedAt = new Map<string, number>();
const modelViewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const loadedLanguageContributions = new Set<string>();
const languageContributionLoads = new Map<string, Promise<void>>();

async function loadCppContribution(): Promise<void> {
    await import('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution');
    loadedLanguageContributions.add('cpp');
    loadedLanguageContributions.add('c');
    loadedLanguageContributions.add('h');
}

async function loadJsonContribution(): Promise<void> {
    await import('monaco-editor/esm/vs/language/json/monaco.contribution');
    loadedLanguageContributions.add('json');
}

function resolveLanguageContributionLoader(language: string): (() => Promise<void>) | null {
    if (language === 'cpp' || language === 'c' || language === 'h') return loadCppContribution;
    if (language === 'json') return loadJsonContribution;
    return null;
}

async function ensureLanguageContribution(language: string): Promise<void> {
    if (loadedLanguageContributions.has(language)) return;

    const loader = resolveLanguageContributionLoader(language);
    if (!loader) {
        loadedLanguageContributions.add(language);
        return;
    }

    const existing = languageContributionLoads.get(language);
    if (existing !== undefined) {
        await existing;
        return;
    }

    const loadPromise = measureAsync('monaco-language-load', loader, language)
        .finally(() => {
            languageContributionLoads.delete(language);
        });
    languageContributionLoads.set(language, loadPromise);
    await loadPromise;
}

function toModelUri(fileKey: string): monaco.Uri {
    return monaco.Uri.parse(`inmemory://avr8js/${encodeURIComponent(fileKey)}`);
}

function touchModel(fileKey: string): void {
    modelLastUsedAt.set(fileKey, Date.now());
}

function evictLeastRecentlyUsedModel(activeFileKey: string): void {
    if (modelCache.size <= MAX_EDITOR_MODELS) return;

    const candidates = [...modelLastUsedAt.entries()]
        .filter(([fileKey]) => fileKey !== activeFileKey)
        .sort((left, right) => left[1] - right[1]);
    const target = candidates[0]?.[0];
    if (!target) return;

    const model = modelCache.get(target);
    model?.dispose();
    modelCache.delete(target);
    modelLastUsedAt.delete(target);
    modelViewStates.delete(target);
}

function getOrCreateModel(fileKey: string, code: string, language: string): monaco.editor.ITextModel {
    const existing = modelCache.get(fileKey);
    if (existing) {
        touchModel(fileKey);
        if (existing.getLanguageId() !== language) {
            monaco.editor.setModelLanguage(existing, language);
        }
        return existing;
    }

    const model = monaco.editor.createModel(code, language, toModelUri(fileKey));
    modelCache.set(fileKey, model);
    touchModel(fileKey);
    evictLeastRecentlyUsedModel(fileKey);
    return model;
}

const Editor = React.memo((
    {
        fileKey,
        code,
        onChange,
        language = 'cpp',
        fontSize = 15,
        wordWrap = 'off',
        diagnostics = [],
        revealPosition,
    }: EditorProps,
) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const activeFileKeyRef = useRef<string | null>(null);
    const bootMeasureRef = useRef<null | (() => number)>(null);
    const [languageReady, setLanguageReady] = React.useState(false);
    // Always holds the latest onChange so the Monaco event handler never goes stale
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    // Flag to suppress onChange when setValue() is called programmatically (tab switch)
    const settingValueRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        setLanguageReady(false);

        void ensureLanguageContribution(language)
            .then(() => {
                if (!cancelled) {
                    setLanguageReady(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setLanguageReady(true);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [language]);

    useEffect(() => {
        if (languageReady && containerRef.current && !editorRef.current) {
            ensureTheme();
            bootMeasureRef.current = startPerfMeasure('monaco-editor-boot', language);
            const initialModel = getOrCreateModel(fileKey, code, language);

            editorRef.current = measureSync('monaco-editor-create', () => monaco.editor.create(containerRef.current, {
                model: initialModel,
                theme: getThemeName(),
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: fontSize,
                fontFamily: "'Menlo', 'Consolas', 'Courier New', monospace",
                fontLigatures: false,
                lineHeight: 24,
                scrollBeyondLastLine: false,
                padding: { top: 10 },
                contextmenu: true,
                copyWithSyntaxHighlighting: true,
                renderWhitespace: 'all',
                renderControlCharacters: false,
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
            }), language);
            activeFileKeyRef.current = fileKey;
            bootMeasureRef.current?.();
            bootMeasureRef.current = null;

            editorRef.current.onDidChangeModelContent(() => {
                if (!settingValueRef.current) {
                    onChangeRef.current?.(editorRef.current?.getValue() || '');
                }
            });

            const runAction = (id: string) => {
                void editorRef.current?.getAction(id)?.run();
            };

            // Keep common clipboard/edit shortcuts reliable inside Electron + Monaco.
            editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
                runAction('editor.action.clipboardCopyAction');
            });
            editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
                runAction('editor.action.clipboardPasteAction');
            });
            editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => {
                runAction('editor.action.clipboardCutAction');
            });
            editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
                runAction('editor.action.selectAll');
            });
        }

        return undefined;
    }, [languageReady, fileKey, code, language, fontSize]);

    useEffect(() => {
        return () => {
            bootMeasureRef.current?.();
            bootMeasureRef.current = null;
            editorRef.current?.dispose();
            editorRef.current = null;
        };
    }, []);

    // Switch Monaco theme when app theme changes (dark ↔ light)
    useEffect(() => {
        const root = document.documentElement;
        const apply = () => monaco.editor.setTheme(getThemeName());
        apply();
        const obs = new MutationObserver(apply);
        obs.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);

    // Handle fontSize/wordWrap changes at runtime
    useEffect(() => {
        editorRef.current?.updateOptions({ fontSize, wordWrap });
    }, [fontSize, wordWrap]);

    // Handle code/language changes (tab switching)
    useEffect(() => {
        if (!languageReady) return;
        const editor = editorRef.current;
        if (!editor) return;

        const nextModel = getOrCreateModel(fileKey, code, language);
        const previousFileKey = activeFileKeyRef.current;
        const currentModel = editor.getModel();

        if (previousFileKey && currentModel && previousFileKey !== fileKey) {
            modelViewStates.set(previousFileKey, editor.saveViewState());
        }

        if (currentModel !== nextModel) {
            editor.setModel(nextModel);
        }

        touchModel(fileKey);
        activeFileKeyRef.current = fileKey;

        if (nextModel.getValue() !== code) {
            settingValueRef.current = true;
            nextModel.pushEditOperations([], [{
                range: nextModel.getFullModelRange(),
                text: code,
            }], () => null);
            settingValueRef.current = false;
        }

        if (nextModel.getLanguageId() !== language) {
            monaco.editor.setModelLanguage(nextModel, language);
        }

        const savedViewState = modelViewStates.get(fileKey);
        if (savedViewState) {
            editor.restoreViewState(savedViewState);
        } else {
            editor.setScrollTop(0);
            editor.setScrollLeft(0);
        }
        editor.focus();
    }, [fileKey, code, language, languageReady]);

    // Apply diagnostics markers to the active Monaco model
    useEffect(() => {
        const model = editorRef.current?.getModel();
        if (!model) return;

        const toMarkerSeverity = (severity: EditorDiagnostic['severity']) => {
            switch (severity) {
                case 'error':
                    return monaco.MarkerSeverity.Error;
                case 'warning':
                    return monaco.MarkerSeverity.Warning;
                case 'info':
                    return monaco.MarkerSeverity.Info;
                default:
                    return monaco.MarkerSeverity.Hint;
            }
        };

        const markers: monaco.editor.IMarkerData[] = diagnostics.map((d) => ({
            startLineNumber: d.startLineNumber,
            startColumn: d.startColumn,
            endLineNumber: d.endLineNumber,
            endColumn: d.endColumn,
            message: d.message,
            severity: toMarkerSeverity(d.severity),
            source: d.source ?? 'chip-build',
        }));

        monaco.editor.setModelMarkers(model, 'chip-build', markers);
    }, [diagnostics, fileKey, code, language]);

    // Reveal and focus a specific editor position when requested by caller
    useEffect(() => {
        if (!revealPosition || !editorRef.current) return;
        const lineNumber = Math.max(1, revealPosition.lineNumber);
        const column = Math.max(1, revealPosition.column);
        editorRef.current.revealPositionInCenter({ lineNumber, column });
        editorRef.current.setPosition({ lineNumber, column });
        editorRef.current.focus();
    }, [revealPosition?.token]);

    return <div ref={containerRef} className="w-full h-full" style={{ backgroundColor: 'var(--vsc-editor-bg, #2b2b2b)' }} />;
});

export default Editor;
