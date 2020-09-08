let editor;

require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor-container'), {
    model: null,
    theme: "vs-dark",
    minimap: {
      enabled: false
    }
  });
});

getEditor = function() {
  return editor;
}

setModel = function(code, ext) {
  require(['vs/editor/editor.main'], function () {
    let model = monaco.editor.createModel(code, ext);
    editor.setModel(model);
  });
}

readTextFile = function(file, ext = 'cpp')
{
  let rawFile = new XMLHttpRequest();

  rawFile.open("GET", file, true);

  rawFile.onreadystatechange = function () {
    if (rawFile.readyState === 4) {
      if (rawFile.status === 200 || rawFile.status == 0) {
        setModel(rawFile.responseText, ext);
      }
    }
  }

  rawFile.send();
}
