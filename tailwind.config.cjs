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
                    bg: '#1e1e1e',
                    sidebar: '#252526',
                    activity: '#333333',
                    tab: '#2d2d2d',
                    tabActive: '#1e1e1e',
                    border: '#3c3c3c',
                    text: '#cccccc',
                    textActive: '#ffffff'
                }
            }
        },
    },
    plugins: [],
}
