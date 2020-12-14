declare const window: any;
declare const monaco: any;
declare function editorLoaded(): any;

// Using CommonJS modules
let Split = require('split.js')

let debug: boolean;
let editor: any;
let diagram: string;
let components: any;
let projectPath: string;
let projectName: string;
let projectHex: string;
let projectFiles: any;
let projectBoard: string;

window.editorLoaded = () => {
  window.require.config({
    paths: {
      vs: "./node_modules/monaco-editor/min/vs"
    }
  });
  window.require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create(document.getElementById('editor-container'), {
      model: null,
      theme: "vs-dark",
      fontFamily: 'Fira Code',
      fontSize: 18,
      renderWhitespace: "all",
      automaticLayout: true,
      minimap: {
        enabled: false
      }
    });
  });
};

export function getEditor() {
  return editor;
}

export function setModel(code: string, ext: string) {
  window.require(['vs/editor/editor.main'], function () {
    let model = monaco.editor.createModel(code, ext);
    editor.setModel(model);
  });
}

export function getProjectPath() {
  return projectPath;
}

export function setProjectPath(folder: string) {
  projectPath = folder;
}

export function getProjectName(ext: string = '') {
  return projectName.concat(ext);
}

export function setProjectName(name: string) {
  projectName = name;
}

export function getProjectHex() {
  return projectHex;
}

export function setProjectHex(folder: string, fileHex: string) {
  projectHex = folder.concat(fileHex);
}

export function initProjectFiles() {
  projectFiles = [];
}

export function getProjectFiles() {
  // return JSON.stringify(projectFiles);
  return projectFiles;
}

export function setProjectFiles(file: any) {
  // Concat multiple files
  projectFiles = projectFiles.concat(file);
}

export function getProjectBoard() {
  return projectBoard;
}

export function setProjectBoard(board: string) {
  projectBoard = board;
}

export function setComponents(componentName: any) {
  components = componentName;
}

export function getComponents() {
  return components;
}

export function setDiagram(content: string) {
  diagram = content;
}

export function setDebug(value: boolean) {
  debug = value;
}

export function getDebug() {
  return debug;
}

function readTextFile(folder: string, fileName: string, type: string = 'file')
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

export function loader(path: string, name: string, files: any, board: string = 'uno', ext: string = 'ino', components: any = []) {
  // Set project path & name
  setProjectPath(path);
  setProjectName(name);
  setProjectBoard(board);

  // Clear project files
  initProjectFiles();

  if (files != undefined) {
    // Get files
    files.forEach((fileName: string, index: number) => {
      if (fileName) {
        readTextFile(path, fileName);
      }
    });
  }

  // Set project hex filename
  setProjectHex(getProjectPath(), getProjectName('.hex'));

  // Load project file
  readTextFile(getProjectPath(), getProjectName('.ino'), 'model');

  // Check component
  if (components != []) {
    setComponents(components);
  }
}

Split(['#panel-left', '#panel-right'], {
  sizes: [50, 50],
  minSize: [710, 100],
  expandToMin: false,
  onDragEnd: function(sizes: any) {
    editorLoaded();
  },
});
