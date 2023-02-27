const tableEl        = document.getElementsByTagName('table')[0]
const tagSelectEl    = document.getElementById('tag-select')
const archSelectEl   = document.getElementById('arch-abi-select')
const systrackVersEl = document.getElementById('systrack-version')
const configLinkEl   = document.getElementById('config-link')
const stderrLinkEl   = document.getElementById('stderr-link')

let db = null
let updateInProgress = false
let firstUpdate = true

function compareTags(a, b) {
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

function getSelection() {
	const archOpt = archSelectEl.selectedOptions[0]
	const tagOpt  = tagSelectEl.selectedOptions[0]
	return [archOpt.dataset.arch, archOpt.dataset.bits, archOpt.dataset.abi, tagOpt.dataset.tag]
}

function setSelection(arch, bits, abi, tag) {
	let archOpt = null
	let tagOpt = null

	// Ensure this combination exists
	if (!db[arch]?.[bits]?.[abi]?.[tag])
		return false

	// Select the right <option> element to match arch/bits/abi
	for (let i = 0; i < archSelectEl.options.length; i++) {
		const opt = archSelectEl.options[i]
		if (opt.dataset.arch === arch && opt.dataset.bits === bits && opt.dataset.abi === abi) {
			archOpt = opt
			break
		}
	}

	// Select the right <option> element to match tag
	for (let i = 0; i < tagSelectEl.options.length; i++) {
		const opt = tagSelectEl.options[i]
		if (opt.dataset.tag === tag) {
			tagOpt = opt
			break
		}
	}

	// Sanity check, ensure the <option> elements are actually found
	if (!archOpt || !tagOpt) {
		console.error('setSelection(): could not find correct <option> elements for', arch, bits, abi, tag)
		return false
	}

	archSelectEl.selectedOptions[0].selected = false
	tagSelectEl.selectedOptions[0].selected = false
	archOpt.selected = true
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

function humanArchName(name, bits) {
	if (name.startsWith('arm')) {
		// We have arm64 and arm, but arm64 is only 64-bit and arm is only
		// 32-bit, therefore we can just avoid the redundant "64" in "arm64".
		name = 'ARM'
	} else if (name === 'mips') {
		name = 'MIPS'
	}

	return `${name} ${bits}-bit`
}

function humanAbiName(abi) {
	// x86
	if (abi === 'x64')
		return 'x84-64'
	if (abi === 'ia32')
		return 'IA-32'
	// arm64
	if (abi.startsWith('aarch'))
		return 'AArch' + abi.slice(5)
	// arm
	if (abi === 'eabi' || abi === 'eabi')
		return abi.toUpperCase()
	// mips
	if (abi === 'o32' || abi === 'o64' || abi === 'n64')
		return abi[0].toUpperCase() + abi.slice(1)
	return abi
}

function fillArchOptions(archs) {
	clearOptions(archSelectEl)
	archs.forEach(([arch, bits, abi]) => {
		const opt = document.createElement('option')
		opt.label = opt.textContent = `${humanArchName(arch, bits)}, ${humanAbiName(abi)} ABI`
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
		opt.label = opt.textContent = tag
		opt.dataset.tag = tag

		// Keep same kernel version tag selected if possible
		if (tag == oldTag)
			opt.selected = true

		tagSelectEl.add(opt)
	})
}

function highlightRow(e) {
	if (updateInProgress)
		return

	e.currentTarget.classList.toggle('highlight')
}

function sortTable(e) {
	if (updateInProgress)
		return

	const header = e.target
	const idx    = Array.from(header.parentNode.children).indexOf(e.target)
	const rows   = Array.from(tableEl.querySelectorAll('tr')).slice(1)
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

function fillRow(row, tag, sc, maxArgs) {
	const ndec = document.createElement('td')
	const nhex = document.createElement('td')
	const name = document.createElement('td')
	const sym  = document.createElement('td')
	const loc  = document.createElement('td')
	const kcfg = document.createElement('td')
	const link = document.createElement('a')

	row.addEventListener('click', highlightRow)
	row.appendChild(ndec)
	row.appendChild(nhex)
	row.appendChild(name)
	row.appendChild(sym)
	row.appendChild(loc)
	row.appendChild(kcfg)

	ndec.textContent = sc.number
	nhex.textContent = `0x${sc.number.toString(16)}`
	name.textContent = sc.name
	sym.textContent  = sc.symbol
	kcfg.textContent = sc.kconfig ?? ''
	link.target = '_blank'
	link.title = 'View in Bootlin Elixir cross referencer'

	if (sc.esoteric) {
		name.title = 'This syscall is esoteric: it only exists on this architecture and has a special definition'
		name.classList.add('esoteric')
	}

	if (sc.file && sc.line !== null) {
		link.href = `https://elixir.bootlin.com/linux/${tag}/source/${sc.file}#L${sc.line}`
		link.textContent = `${sc.file}:${sc.line}`
		loc.appendChild(link)

		if (!sc.good_location) {
			loc.title = 'This syscall definition is not standard, the identified location may be inaccurate'
			loc.classList.add('bad')
		} else if (sc.grepped_location) {
			loc.title = 'This syscall definition was found through grepping, the identified location may be inaccurate'
			loc.classList.add('bad')
		}
	} else if (sc.file) {
		link.href = `https://elixir.bootlin.com/linux/${tag}/source/${sc.file}`
		link.textContent = `${sc.file}:??`
		loc.appendChild(link)
		loc.title = 'The syscall definition could not be located within this file, the identified location may be inaccurate'
		loc.classList.add('bad')
	} else {
		loc.textContent = 'unknown'
		loc.classList.add('unknown')
	}

	for (const arg of sc.signature) {
		const td = document.createElement('td')
		const i = arg.lastIndexOf(' ')

		if (i === -1) {
			td.textContent = arg
		} else {
			const type = document.createElement('span')
			const name = document.createElement('span')
			type.classList.add('argtype')
			name.classList.add('argname')
			type.textContent = arg.slice(0, i)
			name.textContent = arg.slice(i)
			td.appendChild(type)
			td.appendChild(name)
		}

		row.appendChild(td)
	}


	if (sc.signature.length < maxArgs) {
		const td = document.createElement('td')
		td.colSpan = maxArgs - sc.signature.length
		row.appendChild(td)
	}
}

function fillTable(syscallTable, tag) {
	const numReg = syscallTable.kernel.abi.calling_convention.syscall_nr
	const argRegs = syscallTable.kernel.abi.calling_convention.parameters
	const maxArgs = Math.max(...syscallTable.syscalls.map(sc => sc.signature.length))

	const header = document.createElement('tr')
	header.innerHTML = `\
		<th class="sortable ascending" colspan="2"></th>
		<th class="sortable">Name</th>
		<th class="sortable">Symbol</th>
		<th class="sortable">Definition location</th>
		<th class="sortable">Kconfig</th>
	`

	header.children[0].textContent = `Number${numReg ? '\u00a0(' + numReg + ')' : ''}`

	// Do we wanna handle the case of 0 args because signatures could not be
	// extracted? I don't think so to be honest.
	for (let i = 0; i < maxArgs; i++) {
		const th = document.createElement('th')
		th.textContent = `Arg\u00a0${i + 1}\u00a0(${argRegs[i]})`
		header.appendChild(th)
	}

	tableEl.innerHTML = ''
	tableEl.appendChild(header)

	for (const sc of syscallTable.syscalls) {
		const row  = document.createElement('tr')
		fillRow(row, tag, sc, maxArgs)
		tableEl.appendChild(row)
	}

	tableEl.querySelectorAll('th.sortable').forEach(el => el.addEventListener('click', sortTable))
	document.getElementById('container').classList.remove('invisible')
	document.getElementById('loading').classList.add('invisible')
}

async function update(pushHistoryState) {
	const selection = getSelection()
	const [arch, bits, abi, tag] = selection
	const syscallTbable = await fetchSyscallTable(arch, bits, abi, tag)
	const {config, stderr} = db[arch][bits][abi][tag]

	fillTable(syscallTbable, tag)

	systrackVersEl.textContent = syscallTbable.systrack_version

	if (config) {
		configLinkEl.title = configLinkEl.href = `db/${arch}/${bits}/${abi}/${tag}/config.txt`
		configLinkEl.textContent = '[build\u00a0config]'
	} else {
		configLinkEl.textContent = configLinkEl.title = configLinkEl.href = ''
	}

	if (stderr) {
		stderrLinkEl.title = stderrLinkEl.href = `db/${arch}/${bits}/${abi}/${tag}/stderr.txt`
		stderrLinkEl.textContent = '[analysis\u00a0log]'
	} else {
		stderrLinkEl.textContent = stderrLinkEl.title = stderrLinkEl.href = ''
	}

	if (pushHistoryState) {
		if (firstUpdate) {
			history.replaceState(selection, '', '/?' + selectionToQueryString(selection))
			firstUpdate = false
		} else {
			history.pushState(selection, '', '/?' + selectionToQueryString(selection))
		}
	}
}

function selectArch(arch, bits, abi) {
	const tags = Object.keys(db[arch][bits][abi])
	tags.sort(compareTags)
	fillTagOptions(tags)
}

function archSelectChangeHandler(e) {
	beforeUpdate()
	const opt = e.target.selectedOptions[0]
	selectArch(opt.dataset.arch, opt.dataset.bits, opt.dataset.abi)
	update(true).then(afterUpdate)
}

function tagSelectChangeHandler() {
	beforeUpdate()
	update(true).then(afterUpdate)
}

function historyPopStateHandler(e) {
	if (!(e.state instanceof Array) || e.state.length != 4)
		return

	if (setSelection(...e.state)) {
		beforeUpdate()
		update(false).then(afterUpdate)
	}
}

async function setup() {
	const archs = []
	db = await fetchJSON('db/index.json')

	// Join arch, bits and ABI together under the same select for simplicity
	for (const [arch, archdb] of Object.entries(db)) {
		for (const [bits, bitsdb] of Object.entries(archdb)) {
			for (const abi of Object.keys(bitsdb))
				archs.push([arch, bits, abi])
		}
	}

	// TODO: sort these according to some arbitrary "nice" order?
	fillArchOptions(archs)
	selectArch(...archs[0])

	// Restore table from query string if possible
	if (location.search) {
		const selection = queryStringToSelection(location.search)
		if (selection)
			setSelection(...selection)
	}

	update(true)

	archSelectEl.addEventListener('change', archSelectChangeHandler)
	tagSelectEl.addEventListener('change', tagSelectChangeHandler)
	window.addEventListener('popstate', historyPopStateHandler)
}

setup()
