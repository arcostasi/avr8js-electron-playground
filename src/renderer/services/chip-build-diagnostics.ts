import type { EditorDiagnostic, EditorDiagnosticSeverity } from '../types/editor-diagnostics';

function normalizePath(input: string): string {
    return input.replace(/\\/g, '/').toLowerCase();
}

function pathMatchesSource(reportedPath: string, sourceFile: string): boolean {
    const rp = normalizePath(reportedPath.trim());
    const sf = normalizePath(sourceFile.trim());
    if (rp.endsWith(`/${sf}`) || rp === sf) return true;
    const fileOnly = sf.split('/').pop() ?? sf;
    return rp.endsWith(`/${fileOnly}`) || rp === fileOnly;
}

function mapLevel(level: string): EditorDiagnosticSeverity {
    const l = level.toLowerCase();
    if (l.includes('fatal') || l.includes('error')) return 'error';
    if (l.includes('warning')) return 'warning';
    return 'info';
}

export function parseChipBuildDiagnostics(text: string, sourceFile: string): EditorDiagnostic[] {
    const out: EditorDiagnostic[] = [];
    const lines = text.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        let match = line.match(/^(.*):(\d+):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/i);
        if (match) {
            const [, filePath, lineNo, colNo, level, msg] = match;
            if (!pathMatchesSource(filePath, sourceFile)) continue;
            const ln = Math.max(1, Number.parseInt(lineNo, 10) || 1);
            const col = Math.max(1, Number.parseInt(colNo, 10) || 1);
            out.push({
                startLineNumber: ln,
                startColumn: col,
                endLineNumber: ln,
                endColumn: col + 1,
                message: msg || line,
                severity: mapLevel(level),
                source: 'chip-build',
            });
            continue;
        }

        match = line.match(/^(.*):(\d+):\s*(fatal error|error|warning|note):\s*(.*)$/i);
        if (match) {
            const [, filePath, lineNo, level, msg] = match;
            if (!pathMatchesSource(filePath, sourceFile)) continue;
            const ln = Math.max(1, Number.parseInt(lineNo, 10) || 1);
            out.push({
                startLineNumber: ln,
                startColumn: 1,
                endLineNumber: ln,
                endColumn: 2,
                message: msg || line,
                severity: mapLevel(level),
                source: 'chip-build',
            });
        }
    }

    return out;
}
