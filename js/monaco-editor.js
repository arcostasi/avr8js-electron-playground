let editor;
let diagram;
let components;
let debug;
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
  // return JSON.stringify(projectFiles);
  return projectFiles;
}

setProjectFiles = function(file) {
  // Concat multiple files
  projectFiles = projectFiles.concat(file);
}

getProjectBoard = function() {
  return projectBoard;
}

setProjectBoard = function(board) {
  projectBoard = board;
}

setComponents = function (componentName) {
  components = componentName;
}

getComponents = function() {
  return components;
}

setDiagram = function(content) {
  diagram = content;
}

setDebug = function(value) {
  debug = value;
}

getDebug = function() {
  return debug;
}

readTextFile = function(folder, fileName, type = 'file')
{
  let request = new XMLHttpRequest();

  request.open("GET", folder.concat(fileName), true);

  request.onreadystatechange = function () {
    if (request.readyState === 4) {
      if (request.status === 200 || request.status == 0) {
        if (type == 'file') {
          let file = { "name": fileName, "content": request.responseText };
          setProjectFiles(file);
        } else if (type == 'model') {
          setModel(request.responseText, 'cpp');
        } else if (type == 'diagram') {
          setDiagram(request.responseText);
        }
      }
    }
  }

  request.send();
}

loader = function(path, name, files, board = 'uno', components = []) {
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
      readTextFile(path, fileName);
    }
  });

  // Set project hex filename
  setProjectHex(getProjectPath(), getProjectName('.hex'));

  // Load project file
  readTextFile(getProjectPath(), getProjectName('.ino'), 'model');

  // Load project diagram
  // readTextFile(getProjectPath(), 'diagram.json', 'diagram');

  // Check component
  if (components != []) {
    setComponents(components);
  }
}
