import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { createProjectIoService } from './project-io';
import { parseDiagram } from '../renderer/types/wokwi.types';
import { buildNetlist } from '../renderer/services/netlist-builder';

describe('project-io smoke perf', () => {
  let userDataDir = '';
  let service: ReturnType<typeof createProjectIoService>;

  beforeAll(async () => {
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'avr8js-project-io-perf-'));
    service = createProjectIoService({ userDataPath: userDataDir });
  });

  afterAll(async () => {
    if (userDataDir) {
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  });

  it('stays within loose thresholds for discovery, load, parse, and netlist build', async () => {
    const examplesRoot = path.resolve(process.cwd(), 'examples');

    const discoverStart = performance.now();
    const discovered = await service.discoverProjectsFromRoot(examplesRoot, 'external');
    const discoverDurationMs = performance.now() - discoverStart;

    expect(discovered.projects.length).toBeGreaterThan(5);
    expect(discoverDurationMs).toBeLessThan(5000);

    const targetProject = discovered.projects.find((project) => project.name === 'ssd1306')
      ?? discovered.projects.find((project) => project.name === 'hello-world')
      ?? discovered.projects[0];

    expect(targetProject).toBeDefined();

    const loadStart = performance.now();
    const loaded = await service.loadProjectFromDisk({
      name: targetProject!.name,
      board: targetProject!.board,
      dirPath: targetProject!.dirPath,
    });
    const loadDurationMs = performance.now() - loadStart;

    expect(loaded.files.length).toBeGreaterThan(0);
    expect(loadDurationMs).toBeLessThan(1500);

    const diagramFile = loaded.files.find((file) => file.name === 'diagram.json');
    expect(diagramFile).toBeDefined();

    const parseStart = performance.now();
    let parsedDiagram = parseDiagram(JSON.parse(diagramFile!.content));
    for (let iteration = 0; iteration < 99; iteration++) {
      parsedDiagram = parseDiagram(JSON.parse(diagramFile!.content));
    }
    const parseDurationMs = performance.now() - parseStart;

    expect(parsedDiagram.version).toBe(2);
    expect(parseDurationMs).toBeLessThan(1000);

    const netlistStart = performance.now();
    for (let iteration = 0; iteration < 200; iteration++) {
      buildNetlist(parsedDiagram);
    }
    const netlistDurationMs = performance.now() - netlistStart;

    expect(netlistDurationMs).toBeLessThan(1000);
  });
});