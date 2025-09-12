import { describe, expect, it } from 'vitest';

import { createEmptyDiagramForBuildBoard, stringifyEmptyDiagramForBuildBoard } from './board-diagrams';

describe('board-diagrams', () => {
  it('creates a default Uno diagram when no build board is provided', () => {
    const diagram = createEmptyDiagramForBuildBoard();

    expect(diagram.parts).toHaveLength(1);
    expect(diagram.parts[0]).toMatchObject({
      id: 'uno',
      type: 'wokwi-arduino-uno',
    });
  });

  it('creates a Mega diagram from the build board key', () => {
    const diagram = createEmptyDiagramForBuildBoard('mega');

    expect(diagram.parts).toHaveLength(1);
    expect(diagram.parts[0]).toMatchObject({
      id: 'mega',
      type: 'wokwi-arduino-mega',
    });
  });

  it('falls back safely when the build board is unknown', () => {
    const diagram = createEmptyDiagramForBuildBoard('unknown-board');
    const serialized = stringifyEmptyDiagramForBuildBoard('unknown-board');

    expect(diagram.parts[0]).toMatchObject({
      id: 'uno',
      type: 'wokwi-arduino-uno',
    });
    expect(serialized).toContain('wokwi-arduino-uno');
  });
});