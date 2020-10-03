let editor;
let projectPath;
let projectName;
let projectHex;
let projectFiles;
let projectBoard;

require.config({ paths: { 'vs': './node_modules/monaco-editor/min/vs' } });
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor-container'), {
    model: null,
    theme: "vs-dark",
    fontSize: 18,
    renderWhitespace: "all",
    automaticLayout: true,
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

getProjectPath = function() {
  return projectPath;
}

setProjectPath = function(folder) {
  projectPath = folder;
}

getProjectName = function(ext = '') {
  return projectName.concat(ext);
}

setProjectName = function(name) {
  projectName = name;
}

getProjectHex = function() {
  return projectHex;
}

setProjectHex = function(folder, fileHex) {
  projectHex = folder.concat(fileHex);
}

initProjectFiles = function() {
  projectFiles = [];
}

getProjectFiles = function() {
  return projectFiles;
}

setProjectFiles = function(folder, fileName) {
  let file = [{ name: fileName, content: folder + fileName }];
  // Concat multiple files
  projectFiles = projectFiles.concat(file);
}

getProjectBoard = function() {
  return projectBoard;
}

setProjectBoard = function(board) {
  projectBoard = board;
}

readTextFile = function(folder, fileName)
{
  let rawFile = new XMLHttpRequest();

  rawFile.open("GET", folder.concat(fileName), true);

  rawFile.onreadystatechange = function () {
    if (rawFile.readyState === 4) {
      if (rawFile.status === 200 || rawFile.status == 0) {
        setModel(rawFile.responseText, 'cpp');
      }
    }
  }

  rawFile.send();
}

loader = function(path, name, files, board = 'uno') {
  // Set project path & name
  setProjectPath(path);
  setProjectName(name);
  setProjectBoard(board);

  let filesSplit = files.split(",");

  // Clear project files
  initProjectFiles();

  // Get files
  filesSplit.forEach((fileName, index) => {
    if (fileName) {
      setProjectFiles(path, fileName);
    }
  });

  // Set project hex filename
  setProjectHex(getProjectPath(), getProjectName('.hex'));

  // Load project file
  readTextFile(getProjectPath(), getProjectName('.ino'));
}
