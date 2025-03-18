import React from 'react';
import {
    FileCode2, ChevronDown, ChevronRight,
    FileJson, Package, Download, Upload, FolderOpen, FolderPlus, RefreshCcw, RotateCcw, LoaderCircle, X,
} from 'lucide-react';
import type { DiscoveredProject } from '../services/project-loader';
import type { UiSidebarSectionsState } from '../services/ui-session';

interface ProjectFile {
    name: string;
    content: string;
    language: string;
}

interface ProjectSidebarProps {
    files: ProjectFile[];
    openEditorFiles: ProjectFile[];
    activeFile: string;
    onFileSelect: (filename: string) => void;
    onCloseOpenEditor?: (filename: string) => void;
    sectionState: UiSidebarSectionsState;
    onSectionStateChange: (nextState: UiSidebarSectionsState) => void;
    projects: DiscoveredProject[];
    currentProject: string;
    projectActivity?: {
        kind: 'discover' | 'load';
        phase: 'start' | 'progress' | 'done' | 'cancelled';
        message: string;
        completed: number | null;
        total: number | null;
    } | null;
    projectActionsDisabled?: boolean;
    onProjectSelect: (projectName: string) => void;
    onCancelProjectOperation?: () => void;
    onNewProject?: () => void;
    onOpenProjectsFolder?: () => void;
    onResetToExamples?: () => void;
    onRefreshProject?: () => void;
    onExport?: () => void;
    onImport?: () => void;
}

type ProjectActivityView = NonNullable<ProjectSidebarProps['projectActivity']>;

function getProjectProgressText(activity: ProjectActivityView, isCancelling: boolean): string {
    if (activity.total !== null) {
        return `${activity.completed ?? 0} of ${activity.total}`;
    }

    if (activity.completed !== null) {
        return `${activity.completed} item(s)`;
    }

    return isCancelling ? 'Stopping' : 'Working';
}

function getProjectProgressWidth(activity: ProjectActivityView): string {
    if (activity.total !== null && activity.total > 0 && activity.completed !== null) {
        return `${Math.max(8, Math.min(100, (activity.completed / activity.total) * 100))}%`;
    }

    return '24%';
}

interface ProjectActivityBannerProps {
    activity: ProjectActivityView;
    onCancel?: () => void;
}

function ProjectActivityBanner({ activity, onCancel }: Readonly<ProjectActivityBannerProps>) {
    const isCancelling = activity.phase === 'cancelled';
    const progressText = getProjectProgressText(activity, isCancelling);

    return (
        <div className="mx-3 mb-3 rounded-md border border-vscode-border bg-vscode-hover px-3 py-2" role="status" aria-live="polite" aria-busy={!isCancelling}>
            <div className="flex items-center gap-2 text-[12px] text-vscode-textActive">
                {isCancelling
                    ? <X size={13} className="text-amber-300" />
                    : <LoaderCircle size={13} className="animate-spin text-blue-300" />}
                <span className="truncate">{activity.message}</span>
                {onCancel && !isCancelling && (
                    <button
                        type="button"
                        onClick={onCancel}
                        title="Cancel current project operation"
                        className="ml-auto rounded p-0.5 text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-sidebar"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            {(activity.completed !== null || activity.total !== null) && (
                <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-vscode-text opacity-65">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-vscode-sidebar">
                        <div
                            className={[
                                'h-full transition-[width] duration-150',
                                isCancelling ? 'bg-amber-300' : 'bg-blue-400',
                            ].join(' ')}
                            style={{ width: getProjectProgressWidth(activity) }}
                        />
                    </div>
                    <span>{progressText}</span>
                </div>
            )}
        </div>
    );
}

export default function ProjectSidebar({
    files, openEditorFiles, activeFile, onFileSelect,
    onCloseOpenEditor,
    sectionState,
    onSectionStateChange,
    projects, currentProject, projectActivity, onProjectSelect,
    projectActionsDisabled,
    onCancelProjectOperation,
    onNewProject,
    onOpenProjectsFolder, onRefreshProject,
    onResetToExamples,
    onExport, onImport,
}: Readonly<ProjectSidebarProps>) {
    const isBusy = projectActionsDisabled === true;
    const disableProjectSelection = projectActivity?.kind === 'discover';

    const toggleSection = (key: keyof UiSidebarSectionsState) => {
        onSectionStateChange({
            ...sectionState,
            [key]: !sectionState[key],
        });
    };

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar w-full overflow-y-auto no-scrollbar pb-4">
            {/* Header Explorer Title */}
            <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-[11px] font-semibold text-vscode-text uppercase tracking-wider">Explorer</h2>
                <div className="flex items-center gap-1">
                    {onOpenProjectsFolder && (
                        <button
                            type="button"
                            onClick={onOpenProjectsFolder}
                            title="Open Projects Folder"
                            disabled={isBusy}
                            className="text-vscode-text opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                        >
                            <FolderOpen size={13} />
                        </button>
                    )}
                    {onResetToExamples && (
                        <button
                            type="button"
                            onClick={onResetToExamples}
                            title="Reset to built-in examples"
                            disabled={isBusy}
                            className="text-vscode-text opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                        >
                            <RotateCcw size={13} />
                        </button>
                    )}
                    {onNewProject && (
                        <button
                            type="button"
                            onClick={onNewProject}
                            title="New Project"
                            disabled={isBusy}
                            className="text-vscode-text opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                        >
                            <FolderPlus size={13} />
                        </button>
                    )}
                    {onImport && (
                        <button
                            type="button"
                            onClick={onImport}
                            title="Import Project"
                            disabled={isBusy}
                            className="text-vscode-text opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                        >
                            <Upload size={13} />
                        </button>
                    )}
                    {onExport && (
                        <button
                            type="button"
                            onClick={onExport}
                            title="Export Project"
                            disabled={isBusy}
                            className="text-vscode-text opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                        >
                            <Download size={13} />
                        </button>
                    )}
                </div>
            </div>

            {projectActivity && (
                <ProjectActivityBanner activity={projectActivity} onCancel={onCancelProjectOperation} />
            )}

            {/* ── Example Projects Section ── */}
            <button
                type="button"
                className={
                    'flex items-center gap-1 px-1 py-1 '
                    + 'cursor-pointer font-bold text-xs '
                    + 'text-vscode-text hover:bg-vscode-hover '
                    + 'transition-colors uppercase outline-none'
                }
                onClick={() => toggleSection('projectsOpen')}
            >
                {sectionState.projectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                EXAMPLES
            </button>
            {sectionState.projectsOpen && (
                <div className="flex flex-col py-1 mb-2">
                    {projects.map((proj) => (
                        <button
                            key={proj.name}
                            onClick={() => onProjectSelect(proj.name)}
                            disabled={disableProjectSelection}
                            className={`flex items-center gap-2 px-6 py-1.5 text-[13px] transition-colors outline-none
                                ${disableProjectSelection ? 'cursor-not-allowed opacity-50' : ''}
                                ${currentProject === proj.name
                                    ? 'bg-vscode-hover2 text-blue-400 font-medium'
                                    : 'text-vscode-text hover:bg-vscode-hover'}`}
                            title={`Load ${proj.name} (${proj.board})`}
                        >
                            <Package
                                size={14}
                                className={
                                    currentProject === proj.name
                                        ? 'text-blue-400'
                                        : 'text-vscode-text opacity-50'
                                }
                            />
                            <span className="truncate">
                                {proj.name}
                            </span>
                            <span className={
                                'ml-auto text-[10px] '
                                + 'text-vscode-text opacity-40 uppercase'
                            }>
                                {proj.board}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Open Editors Section ── */}
            <button
                type="button"
                className={
                    'flex items-center gap-1 px-1 py-1 '
                    + 'cursor-pointer font-bold text-xs '
                    + 'text-vscode-text hover:bg-vscode-hover '
                    + 'transition-colors uppercase outline-none'
                }
                onClick={() => toggleSection('editorsOpen')}
            >
                {sectionState.editorsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                OPEN EDITORS
            </button>
            {sectionState.editorsOpen && (
                <div className="flex flex-col py-1 mb-2">
                    {openEditorFiles.map((file) => (
                        <div
                            key={'oe-' + file.name}
                            className={[
                                'flex items-center gap-2 px-4 py-1',
                                'text-[13px] text-vscode-text',
                                'hover:bg-vscode-hover',
                                'transition-colors outline-none',
                                activeFile === file.name
                                    ? 'bg-vscode-hover2 text-vscode-textActive'
                                    : '',
                            ].join(' ')}
                        >
                            <button
                                type="button"
                                onClick={() => onFileSelect(file.name)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                title={file.name}
                            >
                                {file.name.endsWith('.json') ? (
                                    <FileJson size={14} className="text-yellow-400" />
                                ) : (
                                    <FileCode2 size={14} className="text-blue-400" />
                                )}
                                <span className="truncate">{file.name}</span>
                            </button>
                            {onCloseOpenEditor && (
                                <button
                                    type="button"
                                    onClick={() => onCloseOpenEditor(file.name)}
                                    className="rounded p-0.5 text-vscode-text opacity-50 hover:opacity-100 hover:bg-vscode-sidebar"
                                    title={`Close ${file.name}`}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Project Files Section ── */}
            <div className="flex items-center justify-between gap-2 px-1 py-1">
                <button
                    type="button"
                    className={
                        'flex min-w-0 items-center gap-1 '
                        + 'cursor-pointer font-bold text-xs '
                        + 'text-vscode-text hover:bg-vscode-hover '
                        + 'transition-colors uppercase outline-none'
                    }
                    onClick={() => toggleSection('explorerOpen')}
                >
                    {sectionState.explorerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {currentProject.toUpperCase() || 'PROJECT'}
                </button>
                {onRefreshProject && (
                    <button
                        type="button"
                        onClick={onRefreshProject}
                        disabled={isBusy}
                        title="Refresh current project from disk"
                        className="text-vscode-text opacity-55 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 p-0.5"
                    >
                        <RefreshCcw size={12} />
                    </button>
                )}
            </div>
            {sectionState.explorerOpen && (
                <div className="flex flex-col py-1">
                    {files.map((file) => (
                        <button
                            key={'proj-' + file.name}
                            onClick={() => onFileSelect(file.name)}
                            className={[
                                'flex items-center gap-2 px-6 py-1',
                                'text-[13px] text-vscode-text',
                                'hover:bg-vscode-hover',
                                'transition-colors outline-none',
                                activeFile === file.name
                                    ? 'bg-vscode-hover2 text-vscode-textActive'
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
