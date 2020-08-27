const interact = require('interactjs')

// Target elements with the "draggable" class
interact('.draggable')
  .draggable({
    // Enable inertial throwing
    inertia: true,
    // Keep the element within the area of it's parent
    modifiers: [
      interact.modifiers.restrictRect({
        restriction: 'parent',
        endOnly: true
      })
    ],

    // Disable autoScroll
    autoScroll: false,

    listeners: {
      // Call this function on every dragmove event
      move: dragMoveListener,

      // Call this function on every dragend event
      end (event) {
        var textEl = event.target.querySelector('p')

        textEl && (textEl.textContent =
          'moved a distance of ' +
          (Math.sqrt(Math.pow(event.pageX - event.x0, 2) +
                     Math.pow(event.pageY - event.y0, 2) | 0))
            .toFixed(2) + 'px')
      }
    }
  })

function dragMoveListener (event) {
  var target = event.target
  // Keep the dragged position in the data-x/data-y attributes
  var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx
  var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy

  // Translate the element
  target.style.webkitTransform =
    target.style.transform =
      'translate(' + x + 'px, ' + y + 'px)'

  // Update the posiion attributes
  target.setAttribute('data-x', x)
  target.setAttribute('data-y', y)
}

// This function is used later in the resizing and gesture demos
window.dragMoveListener = dragMoveListener
