import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_FIRMWARE_FILENAME,
  BUILD_MANIFEST_FILENAME,
  createProjectIoService,
  parseProjectArchive,
  PROJECT_BUILD_DIR,
  ProjectIoCancelledError,
  saveProjectBuildArtifacts,
} from './project-io';

describe('project-io', () => {
  let tempRoot = '';
  let userDataDir = '';

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'avr8js-project-io-'));
    userDataDir = path.join(tempRoot, 'user-data');
    await fs.mkdir(userDataDir, { recursive: true });
  });

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('discovers flat and categorized projects and reuses the persisted index', async () => {
    const examplesRoot = path.join(tempRoot, 'examples');
    const flatProjectDir = path.join(examplesRoot, 'blink-led');
    const categorizedProjectDir = path.join(examplesRoot, 'displays', 'lcd2004');

    await fs.mkdir(flatProjectDir, { recursive: true });
    await fs.mkdir(categorizedProjectDir, { recursive: true });

    await fs.writeFile(path.join(flatProjectDir, 'metadata.json'), JSON.stringify({
      name: 'Blink LED',
      board: 'uno',
      description: 'Flat project',
      tags: ['led'],
    }, null, 2));
    await fs.writeFile(path.join(flatProjectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }, null, 2));

    await fs.writeFile(path.join(categorizedProjectDir, 'metadata.json'), JSON.stringify({
      name: 'LCD 2004',
      board: 'mega',
      description: 'Categorized project',
      tags: ['display'],
    }, null, 2));
    await fs.writeFile(path.join(categorizedProjectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }, null, 2));

    const service = createProjectIoService({ userDataPath: userDataDir });

    const firstPass = await service.discoverProjectsFromRoot(examplesRoot, 'external');
    const secondPass = await service.discoverProjectsFromRoot(examplesRoot, 'external');

    expect(firstPass.projects.map((project) => project.name)).toEqual(expect.arrayContaining(['Blink LED', 'LCD 2004']));
    expect(firstPass.projects.find((project) => project.name === 'lcd2004' || project.name === 'LCD 2004')?.category).toBe('displays');
    expect(secondPass.stats.cacheHits).toBeGreaterThan(0);
    expect(secondPass.stats.projectCount).toBe(firstPass.projects.length);
  });

  it('loads project files with diagram first, sketch second, and optional hex payload', async () => {
    const projectDir = path.join(tempRoot, 'project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'sketch.ino'), 'void setup() {}\nvoid loop() {}\n');
    await fs.writeFile(path.join(projectDir, 'helper.h'), '#pragma once\n');
    await fs.writeFile(path.join(projectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }, null, 2));
    await fs.writeFile(path.join(projectDir, 'sketch.hex'), ':00000001FF\n');
    await fs.writeFile(path.join(projectDir, 'metadata.json'), JSON.stringify({ name: 'Ignored metadata' }));

    const service = createProjectIoService({ userDataPath: userDataDir });
    const loaded = await service.loadProjectFromDisk({
      name: 'Project',
      board: 'uno',
      dirPath: projectDir,
    });

    expect(loaded.hex).toContain(':00000001FF');
    expect(loaded.files.map((file) => file.name)).toEqual(['diagram.json', 'sketch.ino', 'helper.h']);
    expect(loaded.files[0]?.language).toBe('json');
    expect(loaded.files[1]?.language).toBe('cpp');
  });

  it('emits progress for discovery and allows cancellation', async () => {
    const examplesRoot = path.join(tempRoot, 'examples');
    const firstProjectDir = path.join(examplesRoot, 'first');
    const secondProjectDir = path.join(examplesRoot, 'second');
    await fs.mkdir(firstProjectDir, { recursive: true });
    await fs.mkdir(secondProjectDir, { recursive: true });
    await fs.writeFile(path.join(firstProjectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));
    await fs.writeFile(path.join(secondProjectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));

    const service = createProjectIoService({ userDataPath: userDataDir });
    const messages: string[] = [];
    let cancelled = false;

    await expect(service.discoverProjectsFromRoot(examplesRoot, 'external', {
      isCancelled: () => cancelled,
      onProgress: (progress) => {
        messages.push(progress.message);
        if (progress.phase === 'progress') {
          cancelled = true;
        }
      },
    })).rejects.toBeInstanceOf(ProjectIoCancelledError);

    expect(messages[0]).toMatch(/scanning projects/i);
    expect(messages.some((message) => /indexed/i.test(message))).toBe(true);
  });

  it('emits progress for file loading', async () => {
    const projectDir = path.join(tempRoot, 'progress-project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));
    await fs.writeFile(path.join(projectDir, 'sketch.ino'), 'void setup() {}\n');

    const service = createProjectIoService({ userDataPath: userDataDir });
    const events: string[] = [];

    await service.loadProjectFromDisk({ name: 'Progress', board: 'uno', dirPath: projectDir }, {
      onProgress: (progress) => {
        events.push(`${progress.phase}:${progress.message}`);
      },
    });

    expect(events[0]).toMatch(/^start:Loading Progress$/);
    expect(events.some((event) => event.includes('Read diagram.json'))).toBe(true);
    expect(events[events.length - 1]).toMatch(/^done:Loaded Progress$/);
  });

  it('parses avr8js archive payloads and rejects invalid file records', () => {
    const raw = JSON.stringify({
      format: 'avr8js-project',
      version: 1,
      name: 'Imported Project',
      board: 'nano',
      files: [
        { name: 'diagram.json', content: '{}', language: 'json' },
      ],
      exportedAt: new Date().toISOString(),
    });

    const parsed = parseProjectArchive(raw, 'fallback.avr8js');
    expect(parsed.name).toBe('Imported Project');
    expect(parsed.board).toBe('nano');

    expect(() => parseProjectArchive(JSON.stringify({
      format: 'avr8js-project',
      version: 1,
      files: [{ name: 'bad.json', content: '{}' }],
    }), 'bad.avr8js')).toThrow(/invalid project archive files/i);
  });

  it('persists firmware hex and chip wasm into build/ and loads them on reopen', async () => {
    const projectDir = path.join(tempRoot, 'built-project');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'sketch.ino'), 'void setup() {}\n');
    await fs.writeFile(path.join(projectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));

    const chipBytes = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const saved = await saveProjectBuildArtifacts(projectDir, {
      hex: ':100000000C9434000C9449000C9449000C9449000C\n:00000001FF\n',
      board: 'uno',
      backend: 'cloud',
      chipWasms: [{
        wasmFile: 'sensor.chip.wasm',
        wasmBase64: chipBytes.toString('base64'),
      }],
    });

    expect(saved.buildDir).toBe(path.join(projectDir, PROJECT_BUILD_DIR));
    expect(saved.hexPath).toBe(path.join(projectDir, PROJECT_BUILD_DIR, BUILD_FIRMWARE_FILENAME));
    expect(saved.savedFiles).toEqual([BUILD_FIRMWARE_FILENAME, 'sensor.chip.wasm']);

    const manifestRaw = await fs.readFile(path.join(saved.buildDir, BUILD_MANIFEST_FILENAME), 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { hexFile: string; chipFiles: string[]; board: string; backend: string };
    expect(manifest.hexFile).toBe(BUILD_FIRMWARE_FILENAME);
    expect(manifest.chipFiles).toEqual(['sensor.chip.wasm']);
    expect(manifest.board).toBe('uno');
    expect(manifest.backend).toBe('cloud');

    const service = createProjectIoService({ userDataPath: userDataDir });
    const loaded = await service.loadProjectFromDisk({
      name: 'Built Project',
      board: 'uno',
      dirPath: projectDir,
    });

    expect(loaded.hex).toContain(':100000000C943400');
    expect(loaded.customChipArtifacts?.sensor).toBe(chipBytes.toString('base64'));
    expect(loaded.customChipArtifacts?.['sensor.chip.wasm']).toBe(chipBytes.toString('base64'));
  });

  it('prefers build/ artifacts over legacy root artifacts while falling back cleanly', async () => {
    const projectDir = path.join(tempRoot, 'precedence-project');
    await fs.mkdir(path.join(projectDir, PROJECT_BUILD_DIR), { recursive: true });
    await fs.writeFile(path.join(projectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));
    await fs.writeFile(path.join(projectDir, 'legacy.hex'), ':00000001FF\n');
    await fs.writeFile(path.join(projectDir, 'legacy-chip.chip.wasm'), Buffer.from('root-chip'));
    await fs.writeFile(path.join(projectDir, PROJECT_BUILD_DIR, BUILD_FIRMWARE_FILENAME), ':020000040000FA\n:00000001FF\n');
    await fs.writeFile(path.join(projectDir, PROJECT_BUILD_DIR, 'legacy-chip.chip.wasm'), Buffer.from('build-chip'));

    const service = createProjectIoService({ userDataPath: userDataDir });
    const loaded = await service.loadProjectFromDisk({
      name: 'Precedence',
      board: 'uno',
      dirPath: projectDir,
    });

    expect(loaded.hex).toContain(':020000040000FA');
    expect(loaded.customChipArtifacts?.['legacy-chip']).toBe(Buffer.from('build-chip').toString('base64'));
  });

  it('ignores build directories during project discovery and skips traversal wasm filenames', async () => {
    const examplesRoot = path.join(tempRoot, 'examples');
    const projectDir = path.join(examplesRoot, 'blink');
    const buildDir = path.join(projectDir, PROJECT_BUILD_DIR);
    await fs.mkdir(buildDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));
    await fs.writeFile(path.join(buildDir, 'diagram.json'), JSON.stringify({ version: 2, editor: 'wokwi', parts: [], connections: [] }));

    const service = createProjectIoService({ userDataPath: userDataDir });
    const discovered = await service.discoverProjectsFromRoot(examplesRoot, 'external');
    expect(discovered.projects).toHaveLength(1);
    expect(discovered.projects[0]?.dirPath).toBe(projectDir);

    const saved = await saveProjectBuildArtifacts(projectDir, {
      hex: ':00000001FF\n',
      chipWasms: [{
        wasmFile: '../escape.chip.wasm',
        wasmBase64: Buffer.from('nope').toString('base64'),
      }],
    });

    expect(saved.savedFiles).toEqual([BUILD_FIRMWARE_FILENAME]);
    await expect(fs.access(path.join(projectDir, 'escape.chip.wasm'))).rejects.toThrow();
  });
});