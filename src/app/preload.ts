import { Titlebar, Color } from 'custom-electron-titlebar'

const fs = require('fs')
let json = require('../../examples/settings.json');

// Get Loader
declare function loader(path: any, name: any, files: any, board: any, components: any): any;
declare function setDebug(value: boolean): any;

document.addEventListener('DOMContentLoaded', (event) => {

  json.projects.forEach((data: any, index: any) => {

    let loader = "loader('" + data.path + "','"
                            + data.name + "'";

    if (data.files != undefined) {
      loader += ",'" + data.files + "'";
    } else {
      loader += ",''";
    }

    if (data.board != undefined) {
      loader += ",'" + data.board + "'";
    }

    if (data.components != undefined) {
      loader += ",'" + data.components + "'";
    }

    loader += ");";

    document.getElementById("editor-tab").innerHTML +=
      '<button class="btn-white" onclick="' + loader + '">' + data.name + "</button>\n";
  });

  if (json.settings.debug != undefined) {
    setDebug(json.settings.debug);
  }

  // Load initial example
  loader('./examples/blinks/', 'blinks', '', 'uno', ['wokwi-led']);
});

// Change titlebar color
new Titlebar({
  backgroundColor: Color.fromHex('#444')
});
