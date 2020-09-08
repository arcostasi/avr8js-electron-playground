const exPath = './examples/';

blinks = function() {
  readTextFile(exPath + 'blinks/blinks.ino');
}

rgb = function() {
  readTextFile(exPath + 'rgb/rgb.ino');
}

metalballs = function() {
  readTextFile(exPath + 'metaballs/metaballs.ino');
}

display = function() {
  readTextFile(exPath + 'display/display.ino');
}

ssd1306 = function() {
  readTextFile(exPath + 'ssd1306/ssd1306.ino');
}

dht22 = function() {
  readTextFile(exPath + 'dht22/dht22.ino');
}

document.addEventListener('DOMContentLoaded', (event) => {
  // Create tab examples
  createTab("blinks", "blinks()");
  createTab("rgb", "rgb()");
  createTab("metalballs", "metalballs()");
  createTab("display", "display()");
  createTab("ssd1306", "ssd1306()");
  createTab("dht22", "dht22()");

  // Load blink example
  blinks();
});
