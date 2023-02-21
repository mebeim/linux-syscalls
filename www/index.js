const tableEl        = document.getElementsByTagName('table')[0]
const tagSelectEl    = document.getElementById('tag-select')
const archSelectEl   = document.getElementById('arch-abi-select')
const systrackInfoEl = document.getElementById('systrack-info')
const configInfoEl   = document.getElementById('config-info')
const stderrInfoEl   = document.getElementById('stderr-info')

let db = null
let updateInProgress = false

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

function getTagSelection() {
	return tagSelectEl.selectedOptions[0]?.dataset.tag
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

function fillArchOptions(archs) {
	clearOptions(archSelectEl)
	archs.forEach(([arch, bits, abi]) => {
		const opt = document.createElement('option')
		opt.label = `${arch} ${bits}-bit, ${abi} ABI`
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
		opt.label = tag
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
	const numReg = syscallTable.kernel.architecture.calling_convention.syscall_nr
	const argRegs = syscallTable.kernel.architecture.calling_convention.parameters
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

	// So we wanna handle the case of 0 args because signatures could not be
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

function selectArchAndUpdate(arch, bits, abi) {
	const tags = Object.keys(db[arch][bits][abi])
	tags.sort(compareTags)
	fillTagOptions(tags)
	return update()
}

async function update() {
	const [arch, bits, abi, tag] = getSelection()
	const syscallTbable = await fetchSyscallTable(arch, bits, abi, tag)
	const {config, stderr} = db[arch][bits][abi][tag]

	fillTable(syscallTbable, tag)

	systrackInfoEl.textContent = `Systrack v${syscallTbable.systrack_version}`

	if (config) {
		configInfoEl.title = configInfoEl.href = `db/${arch}/${bits}/${abi}/${tag}/config.txt`
		configInfoEl.textContent = '[build config]'
	} else {
		configInfoEl.textContent = configInfoEl.title = configInfoEl.href = ''
	}

	if (stderr) {
		stderrInfoEl.title = stderrInfoEl.href = `db/${arch}/${bits}/${abi}/${tag}/stderr.txt`
		stderrInfoEl.textContent = '[analysis log]'
	} else {
		stderrInfoEl.textContent = stderrInfoEl.title = stderrInfoEl.href = ''
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
	selectArchAndUpdate(...archs[0])

	archSelectEl.addEventListener('change', e => {
		beforeUpdate()
		const opt = e.target.selectedOptions[0]
		selectArchAndUpdate(opt.dataset.arch, opt.dataset.bits, opt.dataset.abi).then(afterUpdate)
	})

	tagSelectEl.addEventListener('change', () => {
		beforeUpdate()
		update().then(afterUpdate)
	})
}

setup()
