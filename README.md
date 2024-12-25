Linux kernel syscall tables
===========================

<img align="left" width="100" height="100" src="https://raw.githubusercontent.com/mebeim/systrack/master/assets/logo.png" alt="Systrack logo"></img>

### Live at **[syscalls.mebeim.net](https://syscalls.mebeim.net)**.

High-quality browsable tables of system calls implemented by the Linux kernel on
various architectures and ABIs. Powered by [Systrack][systrack], a Linux
kernel syscall implementation tracker.

**Features**:

- Tables for multiple architectures, ABIs, and kernel versions, easily
  selectable and switchable.
- URL parameters to share/link a specific table.
- Direct links to syscall definitions within the kernel source code.
- Parameter types, names and corresponding ABI calling convention registers.
- Listed Kconfig options for optional syscalls.
- Downloadable kernel configurations to build kernels with the same syscalls
  listed in the tables.

## Building

To build this static website, you will need Python 3, and optionally the
`fonttools` and `brotli` modules. Run the following in the root of this
repository:

```sh
# Required: copies over db files and builds index
./scripts/build_web_db.py
# Opional: build emoji font (needs fonttools + brotli)
./scripts/build_web_fonts.sh
```

The static website is now available in `www/` folder. You may quickly test it
locally using `python3 -m http.server -d www/`.

---

*Copyright &copy; 2023-2024 Marco Bonelli. Licensed under the GNU General Public License v3.0.*

[systrack]: https://github.com/mebeim/systrack
