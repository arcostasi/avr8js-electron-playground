import { MonacoGlobal, registerFastLEDContributions } from '@wokwi/fastled-monaco';

const fs = require('fs');

declare const window: any;
declare const monaco: any;
declare function editorLoaded(): any;

// Using CommonJS modules
let Split = require('split.js')

let debug: boolean;
let editor: any;
let diagram: string;
let projectPath: string;
let projectName: string;
let projectHex: string;
let projectFiles: any;
let projectBoard: string;
let projectOptions: any;

// Load Editor
window.editorLoaded = () => {
  window.require.config({
    paths: {
      vs: './node_modules/monaco-editor/min/vs'
    },
  });
  window.require(['vs/editor/editor.main'], (monaco: MonacoGlobal) => {
    registerFastLEDContributions(monaco, 'cpp');
    editor = monaco.editor.create(document.getElementById('editor-container'), {
      model: null,
      theme: "vs-dark",
      fontFamily: 'Fira Code',
      fontSize: 18,
      language: 'cpp',
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

export function getProjectOptions() {
  return projectOptions;
}

export function setProjectOptions(options: any) {
  projectOptions = options;
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

function readTextFile(folder: string, fileName: string, type: string = 'file') {
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

export function loader(path: string, name: string, files: any, board: string = 'uno', ext: string = 'ino') {
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

  openDiagram(path + 'diagram.json');
}

Split(['#panel-left', '#panel-right'], {
  sizes: [50, 50],
  minSize: [800, 600],
  expandToMin: false,
  onDragEnd: function (sizes: any) {
    editorLoaded();
  },
});

function openDiagram(file: string) {
  fs.access(file, fs.F_OK, (err: any) => {
    // Remove all elements
    removeAllChildren(document.getElementById("elements"));

    if (err) {
      console.error(err);
      return;
    }

    fetch(file).then(response => response.json()).then(diagram => {
      // Get parts
      diagram.parts.forEach((data: any, index: any) => {
        let div = document.createElement("div");
        let type = data.type;

        // Change neopixel canvas
        if (data.type == "wokwi-neopixel-canvas") {
          type = "canvas";
        }

        // Create element
        let element = document.createElement(type);

        // Define element ID
        element.setAttribute("id", data.id);

        if (data.attrs != undefined) {
          let attr = Object.entries(data.attrs);
          // Assign different attributes to the element
          attr.forEach((a: any, x: any) => {
            // Checks the RAM Size
            if ((a[0] == "__fakeRamSize") &&
              (data.type == "wokwi-arduino-uno")) {
              setProjectOptions({ ramSize: a[1] });
              return;
            }
            // Set attribute and value
            element.setAttribute(a[0], a[1]);
          });
        }

        // Assign custom attributes and styles
        let style = "transform:";

        if ((data.top != undefined) && (data.left != undefined)) {
          div.setAttribute("data-x", data.left);
          div.setAttribute("data-y", data.top);
          style += "translate(" + data.left + "px," + data.top + "px)";
        }

        if (data.rotate != undefined) {
          div.setAttribute("data-angle", data.rotate);
          style += "rotate(" + data.rotate + "deg)";
        } else {
          style += "rotate(0deg)";
        }

        style += ";";

        // Checks background color
        if ((data.attrs != undefined) && (data.attrs.background != undefined)) {
          style += "background: " + data.attrs.background;
        }

        div.setAttribute("style", style);

        // Assign custom class
        switch (data.type) {
          case "wokwi-neopixel-matrix": div.className = "neopixel"; break;
          case "wokwi-lcd1602":
            div.className = "lcd";
            element.backlight = false;
            break;
          case "wokwi-ssd1306": div.className = "ssd1306"; break;
          case "wokwi-buzzer": div.className = "buzzer"; break;
          case "wokwi-neopixel-canvas":
            div.className = "neocanvas";
            element.className = "pixels";
            break;
          default: div.className = "element"; break;
        }

        // Add drag
        div.className += " draggable"

        // Add element
        if ((data.hide == undefined) ||
          ((data.hide != undefined) && (data.hide == false))) {
          div.appendChild(element);
          document.getElementById("elements").appendChild(div);
        }
      });
    });
  });
}

function removeAllChildren(parent: any) {
  // Create the Range object
  var rangeObj = new Range();

  // Select all of the parent's children
  rangeObj.selectNodeContents(parent);

  // Delete everything that is selected
  rangeObj.deleteContents();
}
