'use strict'

function wrapHistory() {
	for (const name of ['pushState', 'replaceState']) {
		(function(name, original) {
			if (!original)
				return

			window.history[name] = function(state) {
				original.apply(window.history, arguments)
				const e = new Event(name.toLowerCase())
				e.state = state
				window.dispatchEvent(e)
			}
		})(name, window.history[name])
	}
}

function historyChangeHandler(e) {
	if (!(e.state instanceof Array) || e.state.length != 4) {
		console.error('Bad history event state:', e.state)
		return
	}

	plausible('pageview', {u: window.location.origin + '/table/' + e.state.join('/')})
}

function historyReplaceStateHandler(e) {
	if (window.homepageVisit) {
		// If the user landed on the homepage, ignore first pushState event to
		// update to the default syscall table and count it as a homepage visit.
		window.homepageVisit = false
		plausible('pageview', {u: window.location.origin})
		return
	}

	historyChangeHandler(e)
}

wrapHistory()
window.addEventListener('popstate', historyChangeHandler)
window.addEventListener('pushstate', historyChangeHandler)
window.addEventListener('replacestate', historyReplaceStateHandler)

if (!window.plausible)
	window.plausible = function() { (window.plausible.q = window.plausible.q || []).push(arguments) }
