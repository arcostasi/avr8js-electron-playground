import React, { useRef, useEffect } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

globalThis.MonacoEnvironment = {
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
    code: string;
    onChange?: (val: string) => void;
    language?: string;
    fontSize?: number;
    wordWrap?: 'on' | 'off';
}

const Editor = React.memo((
    { code, onChange, language = 'cpp', fontSize = 15, wordWrap = 'off' }: EditorProps,
) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    // Always holds the latest onChange so the Monaco event handler never goes stale
    const onChangeRef = useRef(onChange);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    // Flag to suppress onChange when setValue() is called programmatically (tab switch)
    const settingValueRef = useRef(false);

    useEffect(() => {
        if (containerRef.current && !editorRef.current) {
            ensureTheme();

            editorRef.current = monaco.editor.create(containerRef.current, {
                value: code,
                language: language,
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
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
            });

            editorRef.current.onDidChangeModelContent(() => {
                if (!settingValueRef.current) {
                    onChangeRef.current?.(editorRef.current?.getValue() || '');
                }
            });
        }

        return () => {
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
        if (editorRef.current) {
            if (editorRef.current.getValue() !== code) {
                settingValueRef.current = true;
                editorRef.current.setValue(code);
                settingValueRef.current = false;
            }
            const model = editorRef.current.getModel();
            if (model) {
                monaco.editor.setModelLanguage(model, language);
            }
        }
    }, [code, language]);

    return <div ref={containerRef} className="w-full h-full" style={{ backgroundColor: 'var(--vsc-editor-bg, #2b2b2b)' }} />;
});

export default Editor;
