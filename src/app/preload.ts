import { Titlebar, Color } from 'custom-electron-titlebar'

let examples = require('../../examples/settings.json');

// Get Loader
declare function loader(path: any, name: any): any;

document.addEventListener('DOMContentLoaded', (event) => {

  examples.projects.forEach(function(data: any, index: any) {
    let loader = "loader('" + data.path + "', '" + data.name + "')";

    document.getElementById("editor-tab").innerHTML +=
      '<button class="btn-white" onclick="' + loader + '">' + data.name + "</button>\n";
  });

  // Load initial example
  loader('./examples/blinks/', 'blinks');
});

// Change titlebar color
new Titlebar({
    backgroundColor: Color.fromHex('#444')
});
