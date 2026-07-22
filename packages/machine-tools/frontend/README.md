# Hydro Machine Tools

Neutralino image configuration utility built with React, TypeScript and Mantine. It reads and writes the machine's local seat, heartbeat, video and probe configuration; `--presentation` starts the read-only presentation screen.

The image is expected to preinstall the Python probe, `hydro-machine-tools.service`, Python 3.8+ and the distro `python3-websockets` package. The UI never installs runtime components. The seat is stored in `/var/lib/icpc/config.json`; v2 probe settings use `/etc/default/hydro-machine-tools`, while old images continue to use `/etc/default/icpc-heartbeat`.
