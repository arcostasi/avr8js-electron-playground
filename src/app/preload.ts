import { Titlebar, TitlebarColor as Color} from 'custom-electron-titlebar';
import { IpcRenderer } from 'electron';
import * as ed from './editor'

// Using CommonJS modules
const fs = require('fs')
const interact = require('interactjs')
const zoomArr = [0.5, 0.75, 0.85, 0.9, 1];
const element = document.querySelector<HTMLElement>('.elements');
const backgroundColor = Color.fromHex('#444');

let json = require('../../examples/settings.json');
let value = element.getBoundingClientRect().width / element.offsetWidth;
let indexofArr = 4;
let x = 0;
let y = 0;

let ipcRenderer: IpcRenderer;

document.addEventListener('DOMContentLoaded', (event) => {

  // Change titlebar color
  if (backgroundColor) {
    new Titlebar({ backgroundColor });
  } else {
    console.error('Invalid background color');
  }

  json.projects.forEach((data: any, index: any) => {

    let board = 'uno';
    let ext = 'ino';

    if (data.board != undefined) {
      board = data.board;
    }

    if (data.ext != undefined) {
     ext = data.ext;
    }

    let button = document.createElement("button");

    // Assign different attributes to the element
    button.setAttribute("name", "btn-" + index);
    button.setAttribute("class", "btn-white");
    button.innerText = data.name;
    button.onclick = function() {
      ed.loader(data.path, data.name, data.files, board, ext);
    }

    document.getElementById("project-tab").appendChild(button);
  });

  if (json.settings.debug != undefined) {
    ed.setDebug(json.settings.debug);
  }

  // Load start
  ed.loader('./examples/hello-world/', 'hello-world', [], 'uno', 'ino');
});

// Interact
interact('.draggable')
  .draggable({
    // Enable inertial throwing
    inertia: true,
    // Keep the element within the area of it's parent
    modifiers: [
      interact.modifiers.snap({
        targets: [
          interact.createSnapGrid({ x: 5, y: 5 })
        ],
        range: Infinity,
        relativePoints: [ { x: 0, y: 0 } ]
      }),
      interact.modifiers.restrict({
        restriction: 'parent',
        elementRect: { top: 0, left: 0, bottom: 1, right: 1 },
        endOnly: true
      })
    ],
    // Disable autoScroll
    autoScroll: false,

    listeners: {
      // Call this function on every dragmove event
      move: dragMoveListener,

      // Call this function on every dragend event
      end (event: any) {
        let textEl = event.target.querySelector('p')

        textEl && (textEl.textContent =
          'moved a distance of ' +
          (Math.sqrt(Math.pow(event.pageX - event.x0, 2) +
                     Math.pow(event.pageY - event.y0, 2) | 0))
            .toFixed(2) + 'px')
      }
    }
  })

function dragMoveListener(event: any) {
  let target = event.target
  // Keep the dragged position in the data-x/data-y attributes
  const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
  const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy
  const a = (parseFloat(target.getAttribute('data-angle')) || 0)

  // Translate the element
  target.style.webkitTransform =
    target.style.transform =
      'translate(' + x + 'px, ' + y + 'px) rotate(' + a + 'deg)'

  // Update the posiion attributes
  target.setAttribute('data-x', x)
  target.setAttribute('data-y', y)
  target.setAttribute('data-angle', a)
}

// This function is used later in the resizing and gesture demos
(window as any).dragMoveListener = dragMoveListener

document.querySelector('.zoomin').addEventListener('click', () => {
  let zoomSelect = document.querySelector<HTMLInputElement>('#zoom-select');
  if (indexofArr < zoomArr.length-1) {
    indexofArr += 1;
    value = zoomArr[indexofArr];
    zoomSelect.value = value.toString();
    element.style['transform'] = `scale(${value})`;
  }
});

document.querySelector('.zoomout').addEventListener('click', () => {
  let zoomSelect = document.querySelector<HTMLInputElement>('#zoom-select');
  if (indexofArr >0) {
    indexofArr -= 1;
    value = zoomArr[indexofArr];
    zoomSelect.value = value.toString();
    element.style['transform'] = `scale(${value})`
  }
});

// Serial output hidden
document.querySelector('.serial-checkbox').addEventListener('click', (el) => {
  let check = document.querySelector<HTMLInputElement>('#serial-hidden');
  let editor = document.getElementById('editor-container')
  let output = document.getElementById('output-container');

  editor.style.height = (check.checked) ? '60vh' : '83vh';
  output.style.height = (check.checked) ? '25vh' : '2vh';
});

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        red: parseInt(result[1], 16),
        green: parseInt(result[2], 16),
        blue: parseInt(result[3], 16),
      }
    : null;
}
