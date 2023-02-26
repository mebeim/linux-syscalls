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

---

*Copyright &copy; 2023 Marco Bonelli. Licensed under the GNU General Public License v3.0.*

[systrack]: https://github.com/mebeim/systrack
