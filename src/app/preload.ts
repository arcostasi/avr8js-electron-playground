import { Titlebar, Color } from 'custom-electron-titlebar'

let examples = require('../../examples/settings.json');

// Get Loader
declare function loader(path: any, name: any, files: any, board: any): any;
declare function setFiles(path: any, name: any): any;

document.addEventListener('DOMContentLoaded', (event) => {

  examples.projects.forEach((data: any, index: any) => {

    let loader = "loader('" + data.path + "', '"
                            + data.name + "', ";

    if (data.files != undefined) {
      loader += "'" + data.files + "', ";
    } else {
      loader +=  "'', ";
    }

    if (data.board != undefined) {
      loader += "'" + data.board + "');";
    }

    document.getElementById("editor-tab").innerHTML +=
      '<button class="btn-white" onclick="' + loader + '">' + data.name + "</button>\n";
  });

  // Load initial example
  loader('./examples/blinks/', 'blinks', '', 'uno');
});

// Change titlebar color
new Titlebar({
  backgroundColor: Color.fromHex('#444')
});
