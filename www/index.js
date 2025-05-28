'use strict'

const tableEl            = document.getElementsByTagName('table')[0]
const sumamryEl          = document.getElementById('summary')
const themeToggleEl      = document.getElementById('theme-toggle')
const compactSigToggleEl = document.getElementById('compact-sig-toggle')
const tagSelectEl        = document.getElementById('tag-select')
const archSelectEl       = document.getElementById('arch-abi-select')
const systrackVersEl     = document.getElementById('systrack-version')
const configLinkEl       = document.getElementById('config-link')
const stderrLinkEl       = document.getElementById('stderr-link')
const jsonLinkEl         = document.getElementById('json-link')

let db = null
let currentSyscallTable = null
let updateInProgress = false
let firstUpdate = true
let compactSignature = false

function compareTags(a, b) {
	if (a === 'latest') return -1
	if (b === 'latest') return 1
	const va = a.slice(1).split('.').map(n => n.padStart(3, '0'))
	const vb = b.slice(1).split('.').map(n => n.padStart(3, '0'))
	return (va < vb) - (va > vb)
}

async function fetchJSON(path) {
	const res = await fetch(path)
	return res.json()
}

async function fetchSyscallTable(arch, bits, abi, tag) {
	return await fetchJSON(`db/${arch}/${bits}/${abi}/${tag}/table.json`)
}

function getArchSelectionText() {
	return archSelectEl.selectedOptions[0].textContent
}

function getSelection() {
	const archOpt = archSelectEl.selectedOptions[0]
	const tagOpt  = tagSelectEl.selectedOptions[0]
	return [archOpt.dataset.arch, archOpt.dataset.bits, archOpt.dataset.abi, tagOpt.dataset.tag]
}

function setSelection(arch, bits, abi, tag) {
	const abidb = db[arch]?.[bits]?.[abi]
	let archOpt = null
	let tagOpt = null

	// Ensure this arch/bits/abi combo exists
	if (!abidb) {
		console.log('setSelection(): bad selection:', arch, bits, abi)
		return false
	}

	// Populate tags for this arch/bits/abi combo
	fillTagOptionsForArch(arch, bits, abi)

	// Select the right <option> element to match arch/bits/abi
	for (let i = 0; i < archSelectEl.options.length; i++) {
		const opt = archSelectEl.options[i]
		if (opt.dataset.arch === arch && opt.dataset.bits === bits && opt.dataset.abi === abi) {
			archOpt = opt
			break
		}
	}

	// Sanity check
	if (!archOpt) {
		console.error('setSelection(): could not find correct <option> element for', arch, bits, abi)
		return false
	}

	archSelectEl.selectedOptions[0].selected = false
	archOpt.selected = true

	if (tag === undefined)
		return true

	// Ensure this tag exists for the chosen arch/bits/abi combo
	if (!abidb.tables[tag]) {
		console.log(`setSelection(): bad tag for ${arch}/${bits}/${abi}:`, tag)
		return false
	}

	// Select the right <option> element to match tag
	for (let i = 0; i < tagSelectEl.options.length; i++) {
		const opt = tagSelectEl.options[i]
		if (opt.dataset.tag === tag) {
			tagOpt = opt
			break
		}
	}

	// Sanity check
	if (!archOpt || !tagOpt) {
		console.error('setSelection(): could not find correct <option> elements for', arch, bits, abi, tag)
		return false
	}

	tagSelectEl.selectedOptions[0].selected = false
	tagOpt.selected = true
	return true
}

function getTagSelection() {
	return tagSelectEl.selectedOptions[0]?.dataset.tag
}

function queryStringToSelection(qs) {
	let selection = null

	if (qs.startsWith('?'))
		qs = qs.slice(1)

	for (const [k, v] of qs.split('&').map(kv => kv.split('='))) {
		if (k === 'table') {
			selection = decodeURIComponent(v).split('/')
			break
		}
	}

	if (!selection || selection.length != 4)
		return null

	return selection
}

function selectionToQueryString(selection) {
	if (!(selection instanceof Array) || selection.length != 4) {
		console.error('Bad selection to turn into query string:', selection)
		return ''
	}

	const [arch, bits, abi, tag] = selection
	return `table=${arch}/${bits}/${abi}/${tag}`
}

function beforeUpdate() {
	archSelectEl.disabled = true
	tagSelectEl.disabled = true
	updateInProgress = true
}

function afterUpdate() {
	archSelectEl.disabled = false
	tagSelectEl.disabled = false
	updateInProgress = false
}

function clearOptions(selectEl) {
	selectEl.innerHTML = ''
}

function humanArchName(name) {
	if (name.startsWith('arm')) {
		// We have arm64 and arm, but arm64 is only 64-bit and arm is only
		// 32-bit, therefore we can just avoid the redundant "64" in "arm64".
		name = 'ARM'
	} else if (name === 'mips') {
		name = 'MIPS'
	} else if (name === 'powerpc') {
		name = 'PowerPC'
	} else if (name === 'riscv') {
		name = 'RISC-V'
	} else if (name === 's390') {
		name = 'S390'
	}

	return name
}

function humanAbiName(abi) {
	// x86
	if (abi === 'x64')
		return 'x86-64'
	if (abi === 'ia32')
		return 'IA-32'
	// arm64
	if (abi.startsWith('aarch'))
		return 'AArch' + abi.slice(5)

	// Anything else can just go uppercase
	return abi.toUpperCase()
}

function favoriteArch(archs) {
	for (const [arch, bits, abi, _] of archs) {
		if (arch === 'x86' && bits === '64' && abi === 'x64')
			return [arch, bits, abi]
	}
	return archs[0]
}

function realTag(arch, bits, abi, tag) {
	// Convert special "latest" tag to real tag, leave others alone
	if (tag === 'latest')
		return db[arch][bits][abi].tables.latest.realTag
	return tag
}

function fillArchOptions(archs) {
	clearOptions(archSelectEl)
	archs.forEach(([arch, bits, abi, abiBits]) => {
		const opt = document.createElement('option')
		opt.label = opt.textContent = `${humanArchName(arch)} ${bits}-bit, ${humanAbiName(abi)} ABI (${abiBits}-bit)`
		opt.dataset.arch = arch
		opt.dataset.bits = bits
		opt.dataset.abi = abi
		archSelectEl.add(opt)
	})
}

function fillTagOptions(tags) {
	const oldTag = getTagSelection()

	clearOptions(tagSelectEl)
	tags.forEach(tag => {
		const opt = document.createElement('option')
		opt.label = opt.textContent = opt.dataset.tag = tag

		// Keep same kernel version tag selected if possible
		if (tag == oldTag)
			opt.selected = true

		tagSelectEl.add(opt)
	})

	// Add version for special "latest" tag
	const latest = tagSelectEl.options[0]

	// Backwards compatibility if we ever choose to remove it or for some reason
	// the DB does not contain it
	if (latest.dataset.tag !== 'latest')
		console.warn('Tag "latest" missing?')
	else
		latest.label = latest.textContent = `latest (${tags[1]})`
}

function fillTagOptionsForArch(arch, bits, abi) {
	const abidb = db[arch]?.[bits]?.[abi]?.tables
	if (!abidb) {
		console.error('fillTagOptionsForArch(): could not find tables: bad arch/bits/abi combo?', arch, bits, abi)
		return false
	}

	const tags = Object.keys(abidb)
	tags.sort(compareTags)
	fillTagOptions(tags)
	return true
}

function highlightRow(e) {
	if (updateInProgress)
		return

	// Don't highlight the row if the click was on a link
	if (e.target.tagName === 'A')
		return

	e.currentTarget.classList.toggle('highlight')
}

function sortTable(e) {
	if (updateInProgress)
		return

	// Ignore click on the collapse toggle inside the <th>
	if (e.target.classList.contains('collapse-toggle'))
		return

	const header = e.currentTarget
	const idx    = Array.from(header.parentNode.children).indexOf(e.currentTarget)
	const rows   = Array.from(tableEl.querySelectorAll('tr')).slice(2)
	const desc   = header.classList.contains('ascending')
	const body   = rows[0].parentElement
	let getValue

	if (idx === 0) {
		getValue = el => parseInt(el.children[0].textContent, 16)
	} else {
		// The "number" header spans two columns (for decimal and hexadecimal)
		getValue = el => el.children[idx + 1].textContent
	}

	rows.forEach(el => body.removeChild(el))
	rows.sort((a, b) => {
		let va = getValue(a)
		let vb = getValue(b)

		if (desc)
			[va, vb] = [vb, va]

		if (va > vb) return 1
		if (va < vb) return -1
		return 0
	})

	rows.forEach(el => body.appendChild(el))
	tableEl.querySelectorAll('th').forEach(h => h.classList.remove('ascending', 'descending'))
	header.classList.add(desc ? 'descending' : 'ascending')
}

function toggleCollapseColumn(e) {
	if (updateInProgress)
		return

	const columnName = e.currentTarget.parentElement.dataset.column
	const collapsed = (tableEl.dataset.collapse ?? '').trim().split(' ').filter(Boolean)

	if (collapsed.includes(columnName)) {
		collapsed.splice(collapsed.indexOf(columnName), 1)
	} else {
		collapsed.push(columnName)
	}

	tableEl.dataset.collapse = collapsed.join(' ')
	localStorage.setItem('collapsedColumns', tableEl.dataset.collapse)
}

function fillRow(row, realTag, sc, maxArgs) {
	const cells = [
		document.createElement('td'), document.createElement('td'),
		document.createElement('td'), document.createElement('td'),
		document.createElement('td'), document.createElement('td')
	]
	const [ndec, nhex, name, sym, loc, kcfg] = cells
	let argsLeft = compactSignature ? 0 : sc.signature?.length ? maxArgs - sc.signature?.length : maxArgs

	row.addEventListener('click', highlightRow)
	cells.forEach(el => row.appendChild(el))

	name.dataset.column = 'name'
	sym.dataset.column  = 'symbol'
	loc.dataset.column  = 'location'
	kcfg.dataset.column = 'kconfig'

	ndec.textContent = sc.number
	nhex.textContent = `0x${sc.number.toString(16)}`
	name.textContent = sc.name
	sym.textContent  = sc.symbol
	kcfg.textContent = sc.kconfig ?? ''

	if (sc.esoteric) {
		name.title = 'This syscall has an esoteric implementation'
		name.classList.add('esoteric')
	}

	if (sc.file) {
		if (sc.file.startsWith('/')) {
			// Absolute path (possibly broken or poiting to a file generated at
			// build-time), can't link to it.
			loc.textContent = `${sc.file}:${sc.line}`
		} else {
			const link = document.createElement('a')
			link.target = '_blank'
			link.title = 'View in Bootlin Elixir cross referencer'
			link.href = `https://elixir.bootlin.com/linux/${realTag}/source/${sc.file}#L${sc.line}`
			link.textContent = `${sc.file}:${sc.line}`
			loc.appendChild(link)
		}
	}

	if (sc.file && sc.line !== null) {
		if (!sc.good_location) {
			loc.title = 'This syscall definition is not standard, the identified location may be inaccurate'
			loc.classList.add('bad')
		} else if (sc.grepped_location) {
			loc.title = 'This syscall definition was found through grepping, the identified location may be inaccurate'
			loc.classList.add('bad')
		}
	} else if (sc.file) {
		loc.title = 'The syscall definition could not be located within this file, the identified location may be inaccurate'
		loc.classList.add('bad')
	} else {
		loc.textContent = 'unknown'
		loc.classList.add('unknown')
	}

	if (sc.signature === null) {
		// Syscall signature is unknown
		const sig = document.createElement('td')
		sig.textContent = 'unknown signature'
		sig.classList.add('unknown')
		sig.dataset.column = 'signature'
		row.appendChild(sig)
		argsLeft--
	} else if (compactSignature) {
		// Compact signature: single column containing comma-separated args
		const sig = document.createElement('td')
		sig.dataset.column = 'signature'
		row.appendChild(sig)

		if (sc.signature.length > 0) {
			for (let i = 0; i < sc.signature.length; i++) {
				const arg = sc.signature[i]
				const spaceIdx = arg.trimEnd().lastIndexOf(' ')

				if (spaceIdx === -1) {
					sig.append(document.createTextNode(arg))
				} else {
					const type = document.createElement('span')
					const name = document.createElement('span')
					type.classList.add('argtype')
					name.classList.add('argname')
					type.textContent = arg.slice(0, spaceIdx)
					name.textContent = arg.slice(spaceIdx)
					sig.appendChild(type)
					sig.appendChild(name)
				}

				if (i < sc.signature.length - 1)
					sig.append(document.createTextNode(', '))
			}
		} else {
			const type = document.createElement('span')
			type.classList.add('argtype')
			type.textContent = 'void'
			sig.appendChild(type)
		}
	} else {
		// Expanded signature: one column per argument
		for (const arg of sc.signature) {
			const td = document.createElement('td')
			const spaceIdx = arg.trimEnd().lastIndexOf(' ')

			if (spaceIdx === -1) {
				td.textContent = arg
			} else {
				const type = document.createElement('span')
				const name = document.createElement('span')
				type.classList.add('argtype')
				name.classList.add('argname')
				type.textContent = arg.slice(0, spaceIdx)
				name.textContent = arg.slice(spaceIdx)
				td.appendChild(type)
				td.appendChild(name)
			}

			td.dataset.column = 'signature'
			row.appendChild(td)
		}
	}

	// Append multiple <td> elements to be able to style column borders
	for (let i = 0; i < argsLeft; i++) {
		const td = document.createElement('td')
		td.dataset.column = 'signature'
		row.appendChild(td)
	}
}

function fillTable(syscallTable, realTag) {
	const numReg = syscallTable.kernel.abi.calling_convention.syscall_nr
	const argRegs = syscallTable.kernel.abi.calling_convention.parameters
	const maxArgs = syscallTable.syscalls.reduce((acc, sc) => Math.max(acc, sc.signature?.length || 0), 0)
	const [header1, header2] = tableEl.querySelectorAll('tr')

	compactSigToggleEl.textContent = compactSignature ? 'compact' : 'extended'
	header1.children[1].colSpan = maxArgs
	header2.children[0].textContent = `Number${numReg ? '\u00a0(' + numReg + ')' : ''}`

	// Remove arg columns
	while (header2.children.length > 5)
		header2.removeChild(header2.lastChild)

	if (compactSignature) {
		// Compact signature: single column containing comma-separated args
		const th = document.createElement('th')
		const title = document.createElement('span')
		title.classList.add('collapsible')
		title.textContent = `Arguments (${argRegs.join(', ')})`
		th.dataset.column = 'signature'
		th.appendChild(title)
		header2.appendChild(th)
	} else {
		// Expanded signature: one column per argument
		// Do we wanna handle the case of 0 args because no signatures with
		// at least 1 arg could be extracted? I don't think so to be honest,
		// that should never happen (why publish such a table to begin with?).
		for (let i = 0; i < maxArgs; i++) {
			const th = document.createElement('th')
			const title = document.createElement('span')
			title.classList.add('collapsible')
			title.textContent = `Arg\u00a0${i + 1}\u00a0(${argRegs[i]})`
			th.dataset.column = 'signature'
			th.appendChild(title)
			header2.appendChild(th)
		}
	}

	// Quick and dirty way to clean the table and keep the headers
	tableEl.innerHTML = ''
	tableEl.appendChild(header1)
	tableEl.appendChild(header2)

	for (const sc of syscallTable.syscalls) {
		const row = document.createElement('tr')
		fillRow(row, realTag, sc, maxArgs)
		tableEl.appendChild(row)
	}

	document.getElementById('container').classList.remove('invisible')
	document.getElementById('loading').classList.add('invisible')
}

function toggleCompactSignature() {
	if (updateInProgress)
		return

	const selection = getSelection()
	const [arch, bits, abi, tag] = selection
	compactSignature = !compactSignature
	localStorage.setItem('compactSignature', compactSignature)
	// Could be optimized... but I could also not care less for now
	fillTable(currentSyscallTable, realTag(arch, bits, abi, tag))
}

async function update(pushHistoryState) {
	const selection = getSelection()
	const [arch, bits, abi, tag] = selection
	const {config, stderr} = db[arch][bits][abi].tables[tag]
	const newTitle = `Linux syscall table: ${tag}, ${getArchSelectionText()}`

	currentSyscallTable = await fetchSyscallTable(arch, bits, abi, tag)
	fillTable(currentSyscallTable, realTag(arch, bits, abi, tag))

	// Some stats at the bottom of the table
	const n_syscalls = currentSyscallTable.syscalls.length
	const n_esoteric = currentSyscallTable.syscalls.reduce((acc, sc) => acc + sc.esoteric, 0)
	const n_bad_loc  = currentSyscallTable.syscalls.reduce((acc, sc) => acc + !sc.good_location, 0)
	const n_no_loc   = currentSyscallTable.syscalls.reduce((acc, sc) => acc + (sc.file === null), 0)
	const n_no_sig   = currentSyscallTable.syscalls.reduce((acc, sc) => acc + (sc.signature === null), 0)

	sumamryEl.textContent = `${n_syscalls} syscalls`
	if (n_esoteric) sumamryEl.textContent += `, ${n_esoteric} esoteric`
	if (n_bad_loc)  sumamryEl.textContent += `, ${n_bad_loc} non-standard definition` + 's'.substring(0, n_bad_loc ^ 1)
	if (n_no_loc)   sumamryEl.textContent += `, ${n_no_loc} missing location info`
	if (n_no_sig)   sumamryEl.textContent += `, ${n_no_sig} missing signature info`

	systrackVersEl.textContent = currentSyscallTable.systrack_version
	jsonLinkEl.href = `db/${arch}/${bits}/${abi}/${tag}/table.json`

	if (config) {
		configLinkEl.href = `db/${arch}/${bits}/${abi}/${tag}/config.txt`
		configLinkEl.parentElement.classList.remove('invisible')
	} else {
		configLinkEl.parentElement.classList.add('invisible')
	}

	if (stderr) {
		stderrLinkEl.href = `db/${arch}/${bits}/${abi}/${tag}/stderr.txt`
		stderrLinkEl.parentElement.classList.remove('invisible')
	} else {
		configLinkEl.parentElement.classList.add('invisible')
	}

	if (pushHistoryState) {
		if (firstUpdate) {
			history.replaceState(selection, newTitle, '/?' + selectionToQueryString(selection))
			firstUpdate = false
		} else {
			history.pushState(selection, newTitle, '/?' + selectionToQueryString(selection))
		}
	}

	document.title = newTitle
}

function archSelectChangeHandler(e) {
	beforeUpdate()
	const opt = e.target.selectedOptions[0]
	fillTagOptionsForArch(opt.dataset.arch, opt.dataset.bits, opt.dataset.abi)
	update(true).then(afterUpdate)
}

function tagSelectChangeHandler() {
	beforeUpdate()
	update(true).then(afterUpdate)
}

function historyPopStateHandler(e) {
	if (!(e.state instanceof Array) || e.state.length != 4) {
		console.error('Bad history event state:', e.state)
		return
	}

	if (setSelection(...e.state)) {
		beforeUpdate()
		update(false).then(afterUpdate)
	}
}

function setTheme(theme) {
	document.body.dataset.theme = theme
}

function toggleTheme() {
	const newTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'
	setTheme(newTheme)
	// Only save to local storage if manually toggled by the user
	localStorage.setItem('theme', newTheme)
}

function restoreSettings() {
	/* This one is global and defaults to true */
	compactSignature = localStorage.getItem('compactSignature')
	compactSignature = compactSignature === null ? true : compactSignature === 'true'

	let theme = localStorage.getItem('theme')
	if (!theme)
		theme = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';

	const collapsedColumns = localStorage.getItem('collapsedColumns')
	if (collapsedColumns)
		tableEl.dataset.collapse = collapsedColumns

	setTheme(theme)
}

async function setup() {
	const archs = []
	db = await fetchJSON('db/index.json')

	// Join arch, bits and ABI together under the same select for simplicity
	for (const [arch, archdb] of Object.entries(db)) {
		for (const [bits, bitsdb] of Object.entries(archdb)) {
			for (const [abi, abidb] of Object.entries(bitsdb))
				archs.push([arch, bits, abi, abidb.bits])
		}
	}

	archs.sort(([archA, bitsA, abiA, abiBitsA], [archB, bitsB, abiB, abiBitsB]) => {
		// Order by arch name ascending (use human name since that's what will be displayed)
		const archHumanA = humanArchName(archA)
		const archHumanB = humanArchName(archB)
		if (archHumanA < archHumanB) return -1
		if (archHumanA > archHumanB) return 1
		// Order by bits descending (64-bit first)
		if (bitsA < bitsB) return 1
		if (bitsA > bitsB) return -1
		// Order by abi bits descending (64-bit first)
		if (abiBitsA < abiBitsB) return 1
		if (abiBitsA > abiBitsB) return -1
		// Special case if one abi contains "64" and the other "32" (put 64 first)
		if (abiA.includes('32') && abiB.includes('64')) return 1
		if (abiA.includes('64') && abiB.includes('32')) return -1
		// Order by abi ascending
		if (abiA < abiB) return -1
		if (abiA > abiB) return 1
		return 0
	})

	const favorite = favoriteArch(archs)
	fillArchOptions(archs)
	fillTagOptionsForArch(...favorite)
	setSelection(...favorite)

	// Restore table from query string if possible
	if (location.search) {
		const selection = queryStringToSelection(location.search)
		if (selection)
			setSelection(...selection)
	}

	// Distinguish visits to "/" (homepage) from visits to a specific table
	window.homepageVisit = !location.search

	update(true)
	restoreSettings()

	archSelectEl.addEventListener('change', archSelectChangeHandler)
	tagSelectEl.addEventListener('change', tagSelectChangeHandler)
	themeToggleEl.addEventListener('click', toggleTheme)
	compactSigToggleEl.addEventListener('click', toggleCompactSignature)
	tableEl.querySelectorAll('th.sortable').forEach(el => el.addEventListener('click', sortTable))
	tableEl.querySelectorAll('th > .collapse-toggle').forEach(el => el.addEventListener('click', toggleCollapseColumn))
	window.addEventListener('popstate', historyPopStateHandler)
}

setup()
