/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                vscode: {
                    bg:         'var(--vsc-bg)',
                    sidebar:    'var(--vsc-sidebar)',
                    activity:   'var(--vsc-activity)',
                    tab:        'var(--vsc-tab)',
                    tabActive:  'var(--vsc-tab-active)',
                    border:     'var(--vsc-border)',
                    text:       'var(--vsc-text)',
                    textActive: 'var(--vsc-text-active)',
                    panel:      'var(--vsc-panel)',
                    surface:    'var(--vsc-surface)',
                    surface2:   'var(--vsc-surface-2)',
                    input:      'var(--vsc-input)',
                    hover:      'var(--vsc-hover)',
                    hover2:     'var(--vsc-hover-2)',
                    divider:    'var(--vsc-divider)',
                    codeBg:     'var(--vsc-code-bg)',
                }
            }
        },
    },
    plugins: [],
}
