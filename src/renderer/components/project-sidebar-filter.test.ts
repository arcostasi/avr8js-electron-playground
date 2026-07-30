import { describe, expect, it } from 'vitest';
import {
    filterProjectsByCategoryAndQuery,
    filterProjectsByQuery,
    getProjectFolderName,
    listProjectCategories,
    type FilterableProject,
} from './project-sidebar-filter';

const SAMPLE_PROJECTS: FilterableProject[] = [
    {
        name: 'Blink LED',
        slug: 'blink-led',
        dirPath: '/examples/blink-led',
        board: 'uno',
        category: 'basics',
        tags: ['led', 'gpio'],
    },
    {
        name: 'LED 3D Cube (Custom View)',
        slug: 'led-3d-cube-custom-view',
        dirPath: 'C:\\projects\\led-3d-cube-custom-view\\',
        board: 'mega',
        category: 'leds',
        tags: ['fastled', 'customView'],
    },
    {
        name: 'Semáforo Simples',
        slug: 'semaforo-simples',
        dirPath: 'D:/workspace/traffic-light-folder',
        board: 'nano',
        category: 'basics',
    },
];

describe('getProjectFolderName', () => {
    it('extracts folder basename from POSIX and Windows paths with optional trailing slashes', () => {
        expect(getProjectFolderName('/examples/blink-led')).toBe('blink-led');
        expect(getProjectFolderName('C:\\projects\\led-3d-cube-custom-view\\')).toBe('led-3d-cube-custom-view');
        expect(getProjectFolderName('')).toBe('');
    });
});

describe('filterProjectsByQuery', () => {
    it('returns all projects when query is empty or whitespace', () => {
        expect(filterProjectsByQuery(SAMPLE_PROJECTS, '')).toHaveLength(3);
        expect(filterProjectsByQuery(SAMPLE_PROJECTS, '   \t ')).toHaveLength(3);
    });

    it('matches by display name case-insensitively and accent-insensitively', () => {
        const result = filterProjectsByQuery(SAMPLE_PROJECTS, 'semaforo');
        expect(result.map((project) => project.slug)).toEqual(['semaforo-simples']);
    });

    it('matches by folder basename from Windows and POSIX dirPath as well as slug', () => {
        const windowsFolder = filterProjectsByQuery(SAMPLE_PROJECTS, 'led-3d-cube-custom-view');
        expect(windowsFolder.map((project) => project.slug)).toEqual(['led-3d-cube-custom-view']);

        const customFolder = filterProjectsByQuery(SAMPLE_PROJECTS, 'traffic-light-folder');
        expect(customFolder.map((project) => project.slug)).toEqual(['semaforo-simples']);

        const posixFolder = filterProjectsByQuery(SAMPLE_PROJECTS, 'blink-led');
        expect(posixFolder.map((project) => project.slug)).toEqual(['blink-led']);
    });

    it('matches by board and multiple space-separated tokens', () => {
        const byBoard = filterProjectsByQuery(SAMPLE_PROJECTS, 'mega');
        expect(byBoard.map((project) => project.slug)).toEqual(['led-3d-cube-custom-view']);

        const multiToken = filterProjectsByQuery(SAMPLE_PROJECTS, 'cube mega');
        expect(multiToken.map((project) => project.slug)).toEqual(['led-3d-cube-custom-view']);
    });

    it('returns an empty list when no project matches', () => {
        expect(filterProjectsByQuery(SAMPLE_PROJECTS, 'stepper-motor-xyz')).toEqual([]);
    });
});

describe('listProjectCategories & filterProjectsByCategoryAndQuery', () => {
    it('collects category options with counts in curated display order', () => {
        expect(listProjectCategories(SAMPLE_PROJECTS)).toEqual([
            { id: 'basics', label: 'Basics', count: 2 },
            { id: 'leds', label: 'LEDs', count: 1 },
        ]);
    });

    it('combines category filtering with text search', () => {
        expect(filterProjectsByCategoryAndQuery(SAMPLE_PROJECTS, 'all', 'blink').map((p) => p.slug)).toEqual(['blink-led']);
        expect(filterProjectsByCategoryAndQuery(SAMPLE_PROJECTS, 'basics', '').map((p) => p.slug)).toEqual([
            'blink-led',
            'semaforo-simples',
        ]);
        expect(filterProjectsByCategoryAndQuery(SAMPLE_PROJECTS, 'basics', 'nano').map((p) => p.slug)).toEqual([
            'semaforo-simples',
        ]);
        expect(filterProjectsByCategoryAndQuery(SAMPLE_PROJECTS, 'leds', 'blink')).toEqual([]);
    });
});
