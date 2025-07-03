/**
 * settingsStore
 * Persistent application settings using Zustand + localStorage.
 * All fields survive app restarts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ── Types ──────────────────────────────────────────────────────────────────

export type BuildBackend = 'cloud' | 'local';
export type ChipBuildBackend = 'external' | 'embedded-experimental';

const LEGACY_DEFAULT_CHIP_BUILD_COMMAND =
    'clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export-all -o "{{OUTPUT}}" "{{SOURCE}}"';
const DEFAULT_CHIP_BUILD_COMMAND =
    'clang --target=wasm32 -O2 -nostdlib -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined -o "{{OUTPUT}}" "{{SOURCE}}"';

export const DEFAULT_PERF_THRESHOLDS_JSON = JSON.stringify({
    'renderer-app-startup': 1200,
    'startup-load-first-project': 250,
    'project-select-load': 250,
    'project-refresh-load': 250,
    'project-load*': 250,
    'project-discovery*': 500,
    'monaco-*': 300,
    'simulation-*': 400,
}, null, 2);

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
    /** Backend used for custom chip compilation */
    chipBuildBackend: ChipBuildBackend;
    /** Command template used to build custom chips into WASM */
    chipBuildCommand: string;

    // ── Editor ──
    /** Monaco editor font size in px */
    editorFontSize: number;
    /** Auto-save debounce delay in ms (0 = disabled) */
    autoSaveDelay: number;
    /** Monaco word-wrap setting */
    wordWrap: 'on' | 'off';
    /** Enable lightweight runtime performance logs and measurements */
    performanceMode: boolean;
    /** JSON map of exact or prefix thresholds for performance operations */
    performanceThresholdsJson: string;

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
    arduinoCliPath: String.raw`C:\Tools\arduino`,
    arduinoCliBin: 'arduino-cli',
    fqbnMap: {
        uno: 'arduino:avr:uno',
        mega: 'arduino:avr:mega',
        nano: 'arduino:avr:nano',
        mini: 'arduino:avr:mini',
    },
    extraFlags: '',
    chipBuildBackend: 'external',
    chipBuildCommand: DEFAULT_CHIP_BUILD_COMMAND,

    // Editor
    editorFontSize: 15,
    autoSaveDelay: 1000,
    wordWrap: 'off',
    performanceMode: false,
    performanceThresholdsJson: DEFAULT_PERF_THRESHOLDS_JSON,

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
            merge: (persistedState, currentState) => {
                const persisted = (persistedState ?? {}) as Partial<SettingsState>;
                const merged = {
                    ...currentState,
                    ...persisted,
                    fqbnMap: {
                        ...currentState.fqbnMap,
                        ...persisted.fqbnMap,
                    },
                } as SettingsState;

                if (merged.chipBuildCommand === LEGACY_DEFAULT_CHIP_BUILD_COMMAND) {
                    merged.chipBuildCommand = DEFAULT_CHIP_BUILD_COMMAND;
                }

                return merged;
            },
        },
    ),
);
