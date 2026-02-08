/**
 * settingsStore
 * Persistent application settings using Zustand + localStorage.
 * All fields survive app restarts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ── Types ──────────────────────────────────────────────────────────────────

export type BuildBackend = 'cloud' | 'local';

/** Per-board FQBN overrides for arduino-cli */
export interface FQBNMap {
    uno: string;
    mega: string;
    nano: string;
    [board: string]: string;
}

export interface AppSettings {
    // ── Build ──
    buildBackend: BuildBackend;
    /** Hexi / Wokwi cloud compiler URL */
    cloudUrl: string;
    /** Folder that contains the arduino-cli binary (e.g. C:\Arduino) */
    arduinoCliPath: string;
    /** Binary name inside arduinoCliPath (usually "arduino-cli" or "arduino-cli.exe") */
    arduinoCliBin: string;
    /** FQBN override per board key */
    fqbnMap: FQBNMap;
    /** Extra flags appended to every arduino-cli compile call */
    extraFlags: string;

    // ── Editor ──
    /** Monaco editor font size in px */
    editorFontSize: number;
    /** Auto-save debounce delay in ms (0 = disabled) */
    autoSaveDelay: number;
    /** Monaco word-wrap setting */
    wordWrap: 'on' | 'off';

    // ── Simulator ──
    /** Default wire colour for newly drawn connections */
    defaultWireColor: string;
    /** Show pin-name tooltip on hover in edit mode */
    showPinTooltips: boolean;

    // ── Appearance ──
    /** Application colour theme */
    theme: 'dark' | 'light';
}

export const DEFAULT_SETTINGS: AppSettings = {
    // Build
    buildBackend: 'cloud',
    cloudUrl: 'https://hexi.wokwi.com',
    arduinoCliPath: 'C:\\Tools\\arduino',
    arduinoCliBin: 'arduino-cli',
    fqbnMap: {
        uno: 'arduino:avr:uno',
        mega: 'arduino:avr:mega',
        nano: 'arduino:avr:nano',
        mini: 'arduino:avr:mini',
    },
    extraFlags: '',

    // Editor
    editorFontSize: 15,
    autoSaveDelay: 1000,
    wordWrap: 'off',

    // Simulator
    defaultWireColor: 'green',
    showPinTooltips: true,

    // Appearance
    theme: 'dark',
};

// ── Store ──────────────────────────────────────────────────────────────────

interface SettingsState extends AppSettings {
    updateSettings: (patch: Partial<AppSettings>) => void;
    resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            ...DEFAULT_SETTINGS,

            updateSettings: (patch) =>
                set((prev) => {
                    // Deep-merge fqbnMap if present in patch
                    const fqbnMap = patch.fqbnMap
                        ? { ...prev.fqbnMap, ...patch.fqbnMap }
                        : prev.fqbnMap;
                    return { ...prev, ...patch, fqbnMap };
                }),

            resetSettings: () =>
                set({ ...DEFAULT_SETTINGS }),
        }),
        {
            name: 'avr8js-electron-settings', // localStorage key
            storage: createJSONStorage(() => localStorage),
        },
    ),
);
