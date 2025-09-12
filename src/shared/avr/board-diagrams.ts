import type { WokwiDiagram } from '../../renderer/types/wokwi.types';
import { defaultBoardProfile, getBoardProfileByBuildBoard } from './profiles';

function getBoardPartId(buildBoard: string): string {
  const normalized = buildBoard.trim().toLowerCase();
  return normalized || defaultBoardProfile.buildBoard;
}

export function createEmptyDiagramForBuildBoard(buildBoard?: string): WokwiDiagram {
  const boardProfile = buildBoard
    ? (getBoardProfileByBuildBoard(buildBoard) ?? defaultBoardProfile)
    : defaultBoardProfile;

  return {
    version: 2,
    author: 'Anonymous maker',
    editor: 'wokwi',
    parts: [{
      type: boardProfile.wokwiType,
      id: getBoardPartId(boardProfile.buildBoard),
      top: 0,
      left: 0,
      rotate: 0,
      attrs: {},
    }],
    connections: [],
  };
}

export function stringifyEmptyDiagramForBuildBoard(buildBoard?: string): string {
  return JSON.stringify(createEmptyDiagramForBuildBoard(buildBoard), null, 2);
}