/**
 * FastLED Contributions for Monaco Editor
 *
 * Copyright (C) 2021 Uri Shaked
 */

import { fastledAutocomplete } from './fastled-auto-complete';
import { provideColorPresentations, provideDocumentColors } from './fastled-colors';
import { fastledSnippets } from './fastled-snippets';
import { MonacoGlobal } from './types';

export function registerFastLEDContributions(monaco: MonacoGlobal, languageId: string) {
  monaco.languages.registerColorProvider(languageId, {
    provideColorPresentations(model, colorInfo) {
      return provideColorPresentations(colorInfo);
    },

    provideDocumentColors(model) {
      return provideDocumentColors(model);
    },
  });

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const value = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      return {
        suggestions: fastledAutocomplete(monaco, value) ?? [],
      };
    },
  });

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['(', ',', ' '],
    provideCompletionItems() {
      return {
        suggestions: fastledSnippets(monaco),
      };
    },
  });
}
