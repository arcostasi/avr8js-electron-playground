import type { DiscoveredProject } from '../services/project-loader';

export type FilterableProject = Pick<
    DiscoveredProject,
    'name' | 'slug' | 'dirPath' | 'board' | 'category'
> & {
    tags?: readonly string[];
};

export interface ProjectCategoryOption {
    id: string;
    label: string;
    count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
    basics: 'Basics',
    leds: 'LEDs',
    display: 'Displays',
    sensors: 'Sensors',
    actuators: 'Actuators',
    input: 'Input',
    audio: 'Audio',
    games: 'Games',
    storage: 'Storage',
    advanced: 'Advanced',
    uncategorized: 'Other',
};

const CATEGORY_ORDER: string[] = [
    'basics',
    'leds',
    'display',
    'sensors',
    'actuators',
    'input',
    'audio',
    'games',
    'storage',
    'advanced',
    'uncategorized',
];

function formatCategoryLabel(category: string): string {
    const mapped = CATEGORY_LABELS[category];
    if (mapped) return mapped;
    return category.length > 0
        ? category.charAt(0).toUpperCase() + category.slice(1)
        : 'Other';
}

function normalizeSearchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Extracts the folder basename from a POSIX or Windows project directory path.
 */
export function getProjectFolderName(dirPath: string): string {
    const segments = dirPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
    return segments.length > 0 ? segments[segments.length - 1] : '';
}

/**
 * Collects unique categories present in the discovered project list with item counts.
 */
export function listProjectCategories<T extends Pick<FilterableProject, 'category'>>(
    projects: readonly T[],
): ProjectCategoryOption[] {
    const counts = new Map<string, number>();
    for (const project of projects) {
        const key = project.category?.trim() || 'uncategorized';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries())
        .sort(([a], [b]) => {
            const idxA = CATEGORY_ORDER.indexOf(a);
            const idxB = CATEGORY_ORDER.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        })
        .map(([id, count]) => ({
            id,
            label: formatCategoryLabel(id),
            count,
        }));
}

/**
 * Filters projects using case- and accent-insensitive token matching against
 * display name, folder basename, slug, board, category, and optional tags.
 */
export function filterProjectsByQuery<T extends FilterableProject>(
    projects: readonly T[],
    query: string,
): T[] {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return projects.slice();
    }

    const tokens = normalizedQuery.split(/\s+/);
    return projects.filter((project) => {
        const haystack = normalizeSearchText([
            project.name,
            project.slug,
            getProjectFolderName(project.dirPath),
            project.board,
            project.category,
            ...(project.tags ?? []),
        ].join(' '));

        return tokens.every((token) => haystack.includes(token));
    });
}

/**
 * Filters projects by optional category ('all' includes everything) and search query.
 */
export function filterProjectsByCategoryAndQuery<T extends FilterableProject>(
    projects: readonly T[],
    category: string,
    query: string,
): T[] {
    const byCategory = !category || category === 'all'
        ? projects
        : projects.filter((project) => (project.category?.trim() || 'uncategorized') === category);
    return filterProjectsByQuery(byCategory, query);
}
