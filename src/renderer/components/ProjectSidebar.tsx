import React, { useState } from 'react';
import {
    FileCode2, ChevronDown, ChevronRight,
    FileJson, Package, Download, Upload,
} from 'lucide-react';
import type { DiscoveredProject } from '../services/project-loader';

interface ProjectFile {
    name: string;
    content: string;
    language: string;
}

interface ProjectSidebarProps {
    files: ProjectFile[];
    activeFile: string;
    onFileSelect: (filename: string) => void;
    projects: DiscoveredProject[];
    currentProject: string;
    onProjectSelect: (projectName: string) => void;
    onExport?: () => void;
    onImport?: () => void;
}

export default function ProjectSidebar({
    files, activeFile, onFileSelect,
    projects, currentProject, onProjectSelect,
    onExport, onImport,
}: ProjectSidebarProps) {
    const [editorsOpen, setEditorsOpen] = useState(true);
    const [explorerOpen, setExplorerOpen] = useState(true);
    const [projectsOpen, setProjectsOpen] = useState(true);

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar w-full overflow-y-auto no-scrollbar pb-4">
            {/* Header Explorer Title */}
            <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-[11px] font-semibold text-vscode-text uppercase tracking-wider">Explorer</h2>
                <div className="flex items-center gap-1">
                    {onImport && (
                        <button
                            onClick={onImport}
                            title="Import Project"
                            className="text-gray-500 hover:text-gray-300 p-0.5"
                        >
                            <Upload size={13} />
                        </button>
                    )}
                    {onExport && (
                        <button
                            onClick={onExport}
                            title="Export Project"
                            className="text-gray-500 hover:text-gray-300 p-0.5"
                        >
                            <Download size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Example Projects Section ── */}
            <div
                className={
                    'flex items-center gap-1 px-1 py-1 '
                    + 'cursor-pointer font-bold text-xs '
                    + 'text-vscode-text hover:bg-[#2a2d2e] '
                    + 'transition-colors uppercase outline-none'
                }
                onClick={() => setProjectsOpen(!projectsOpen)}
            >
                {projectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                EXAMPLES
            </div>
            {projectsOpen && (
                <div className="flex flex-col py-1 mb-2">
                    {projects.map((proj) => (
                        <button
                            key={proj.name}
                            onClick={() => onProjectSelect(proj.name)}
                            className={`flex items-center gap-2 px-6 py-1.5 text-[13px] transition-colors outline-none
                                ${currentProject === proj.name
                                    ? 'bg-[#37373d] text-blue-400 font-medium'
                                    : 'text-vscode-text hover:bg-[#2a2d2e]'}`}
                            title={`Load ${proj.name} (${proj.board})`}
                        >
                            <Package
                                size={14}
                                className={
                                    currentProject === proj.name
                                        ? 'text-blue-400'
                                        : 'text-gray-500'
                                }
                            />
                            <span className="truncate">
                                {proj.name}
                            </span>
                            <span className={
                                'ml-auto text-[10px] '
                                + 'text-gray-600 uppercase'
                            }>
                                {proj.board}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Open Editors Section ── */}
            <div
                className={
                    'flex items-center gap-1 px-1 py-1 '
                    + 'cursor-pointer font-bold text-xs '
                    + 'text-vscode-text hover:bg-[#2a2d2e] '
                    + 'transition-colors uppercase outline-none'
                }
                onClick={() => setEditorsOpen(!editorsOpen)}
            >
                {editorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                OPEN EDITORS
            </div>
            {editorsOpen && (
                <div className="flex flex-col py-1 mb-2">
                    {files.map((file) => (
                        <button
                            key={'oe-' + file.name}
                            onClick={() => onFileSelect(file.name)}
                            className={[
                                'flex items-center gap-2 px-6 py-1',
                                'text-[13px] text-vscode-text',
                                'hover:bg-[#2a2d2e]',
                                'transition-colors outline-none',
                                activeFile === file.name
                                    ? 'bg-[#37373d] text-vscode-textActive'
                                    : '',
                            ].join(' ')}
                            title={file.name}
                        >
                            {file.name.endsWith('.json') ? (
                                <FileJson size={14} className="text-yellow-400" />
                            ) : (
                                <FileCode2 size={14} className="text-blue-400" />
                            )}
                            <span className="truncate">{file.name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Project Files Section ── */}
            <div
                className={
                    'flex items-center gap-1 px-1 py-1 '
                    + 'cursor-pointer font-bold text-xs '
                    + 'text-vscode-text hover:bg-[#2a2d2e] '
                    + 'transition-colors uppercase outline-none'
                }
                onClick={() => setExplorerOpen(!explorerOpen)}
            >
                {explorerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {currentProject.toUpperCase() || 'PROJECT'}
            </div>
            {explorerOpen && (
                <div className="flex flex-col py-1">
                    {files.map((file) => (
                        <button
                            key={'proj-' + file.name}
                            onClick={() => onFileSelect(file.name)}
                            className={[
                                'flex items-center gap-2 px-6 py-1',
                                'text-[13px] text-vscode-text',
                                'hover:bg-[#2a2d2e]',
                                'transition-colors outline-none',
                                activeFile === file.name
                                    ? 'bg-[#37373d] text-vscode-textActive'
                                    : '',
                            ].join(' ')}
                            title={file.name}
                        >
                            {file.name.endsWith('.json') ? (
                                <FileJson size={14} className="text-yellow-400" />
                            ) : (
                                <FileCode2 size={14} className="text-blue-400" />
                            )}
                            <span className="truncate">{file.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
