// const Panzoom = require('@panzoom/panzoom');
// const elem = document.getElementById('elements');
// const panzoom = Panzoom(elem, {
//   maxScale: 5
// });

// panzoom.pan(10, 10);
// panzoom.zoom(1, { animate: true });

const zoomArr = [0.5, 0.75, 0.85, 0.9, 1];
const element = document.querySelector('.elements');

let value = element.getBoundingClientRect().width / element.offsetWidth;
let indexofArr = 4;

handleZoomChange = () => {
  let val = document.querySelector('#zoom-select').value;
  val = Number(val);
  indexofArr = zoomArr.indexOf(val);
  element.style['transform'] = `scale(${val})`;
}

document.querySelector('.zoomin').addEventListener('click', () => {
  if (indexofArr < zoomArr.length-1) {
    indexofArr += 1;
    value = zoomArr[indexofArr];
    document.querySelector('#zoom-select').value = value;
    element.style['transform'] = `scale(${value})`;
  }
});

document.querySelector('.zoomout').addEventListener('click', () => {
  if (indexofArr >0) {
    indexofArr -= 1;
    value = zoomArr[indexofArr];
    document.querySelector('#zoom-select').value = value;
    element.style['transform'] = `scale(${value})`
  }
});

