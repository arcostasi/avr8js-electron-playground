// Using CommonJS modules
let Split = require('split.js')

Split(['#panel-left', '#panel-right'], {
  sizes: [50, 50],
  minSize: [710, 100],
  expandToMin: false
})

// Serial output hidden
document.querySelector('.serial-checkbox').addEventListener('click', (el) => {
  let check = document.getElementById('serial-hidden');
  let editor = document.getElementById('editor-container')
  let output = document.getElementById('output-container');

  editor.style.height = (check.checked) ? '60vh' : '83vh';
  output.style.height = (check.checked) ? '25vh' : '2vh';
});
