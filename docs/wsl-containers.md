# WSL containers

The Containers workspace manages the normal default WSLc session for the current Windows user. It requires stable WSL 3.0.1 or newer. Opening the distribution workspace does not connect to WSLc. Connect may start the container environment; reconnect explicitly after a session disappears.

The inventory includes containers created elsewhere in that session. Docker and Podman inventories and elevated or custom WSLc sessions are separate. Names are display labels; existing-container actions use a full container ID. A connection captures the session name and ID, which are checked before and after each CLI operation. WSLc routes the actual command by session name. A replacement during dispatch can make a write outcome unknown; reconnect and inspect the resulting resources before retrying. Cleanup never blindly targets the replacement session.

## Removing containers

Remove asks for confirmation, then stops a running container before deleting it. If stopping or session verification fails, deletion is not attempted. The app verifies a stopped state and uses ordinary removal; it does not force removal. Named volumes, bind-mounted files and images are retained. Only the container and its writable layer are deleted.
## Backup and restore

A complete backup includes a stopped container's root filesystem and every supported effective creation setting, plus supported persistent data. Stop the container before Backup. Backup does not stop a workload automatically or capture running memory.

Native complete backup, restore and configuration recreation are currently unavailable: WSLc 3.0.1 inspect omits effective settings that its create command accepts, including stop signal, DNS and shared-memory size. Rejecting unknown inspect keys cannot prove that those absent settings were default. The application reports this configuration coverage gate even for app-created containers. The versioned archive and restore orchestration are implemented and tested with a mock runtime that explicitly attests its complete simulated configuration. Native restore is rejected before opening a bundle or changing runtime objects, and its button explains the gate. Native rootfs export/import code is retained for a future authoritative configuration contract and verified roundtrip; a filesystem export alone is never presented as complete backup.

Named volumes have a separate release gate. Their archive orchestration and new-volume mapping are implemented and tested with a filesystem-backed runtime double. The native helper is unavailable until a pinned helper has proved ownership, permissions, links, xattrs and application data restoration on stable WSLc. Stopping one container is insufficient if another workload writes to its shared volume. Bind mounts, anonymous or external volumes, devices, tmpfs and unsupported settings block complete backup. The application does not label a root filesystem export a complete backup.

Choose a new `.wslcbackup` file. Existing files are never overwritten. A bundle becomes visible at the selected path only after every member is written, checked and synced. Publication uses an atomic, exclusive hardlink on the same filesystem; output filesystems without hardlink support fail safely. Staging is created with a protected Windows ACL granting access only to the current user, and its effective ACL is verified before any configuration or filesystem data is written. It retains that protection even under a permissive destination directory. Unsupported filesystem ACLs abort before content capture.

Backups include environment secrets and application data. Store them in a private directory and protect any copies. SHA-256 checksums detect corruption; they do not authenticate a backup's author. Restore only trusted bundles.

Restore requires an explicit new container name. It checks the complete bundle, platform, configuration, names and free staging space before importing runtime data. It imports the root filesystem as a new local image and creates a stopped container. Supported volumes receive fresh names. Existing containers and volumes are retained. If creation fails, cleanup uses only resources recorded as created by that attempt. Success and failure both explicitly attempt local staging cleanup. A sharing violation or other cleanup failure reports the exact owned staging path without including configuration values. If a backup or restored container was already created, the error says so and retains that completed result; release the files and remove only the reported staging directory. Drop provides a final best-effort fallback.

An imported root filesystem does not retain the original image layer history, registry provenance or signatures. Review published ports and service data before starting a restored container.

### Bundle format, version 1

The outer archive is an uncompressed application-owned tar:

```text
manifest.json
container.json
rootfs.tar
volumes/v000.tar       # only when a verified adapter supports this volume
```

`manifest.json` records schema version, completion, app/runtime version, Linux platform, Unix creation timestamp, historical source session/container identity, volume inventory, member byte lengths and SHA-256 checksums. Complete bundles have no exclusions. `container.json` contains the exact supported typed effective creation specification. Each volume inventory entry records its original name, target, read-only setting and fixed archive key.

Only fixed regular-file members are accepted. Duplicate members, unsafe paths, unknown members, PAX/GNU extensions, links, sparse entries, missing data, unknown schema fields, checksum failures and mismatched coverage are refused. Outer members are streamed to an attempt-owned staging directory; Linux rootfs and volume archives remain opaque and are never extracted on Windows. Their contents are handed only to the Linux runtime importer or a verified helper.

Limits are 1 MiB per JSON member, 16 GiB per Linux archive, 64 GiB of total member data and 66 outer members. Native rootfs export is monitored for size and timeout. Capacity checks use the Windows free-space API before staging and again before bundle publication. Restore requires space for its staged archive contents plus a 64 MiB reserve; runtime import can require additional space inside the WSLc storage disk and can still fail cleanly.

### Source contracts and verification status

Native export uses `container export --output <absolute-file> <full-id>`. Import uses `image import --no-trunc <absolute-rootfs-file> <unique-local-reference>`. WSLc anchors positional arguments, so command options precede them. Container creation reapplies the captured configuration without pulling the imported image or starting the container. Failed import cleanup removes only its unique image reference with `image rm --no-prune <reference>`, preserving preexisting content-addressed image data.

These commands are based on pinned Microsoft WSL 3.0.1 source: [export arguments](https://github.com/microsoft/WSL/blob/3.0.1/src/windows/wslc/commands/ContainerExportCommand.cpp), [export task](https://github.com/microsoft/WSL/blob/3.0.1/src/windows/wslc/tasks/ContainerTasks.cpp), [import arguments](https://github.com/microsoft/WSL/blob/3.0.1/src/windows/wslc/commands/ImageImportCommand.cpp), [import task](https://github.com/microsoft/WSL/blob/3.0.1/src/windows/wslc/tasks/ImageTasks.cpp), and [image removal arguments](https://github.com/microsoft/WSL/blob/3.0.1/src/windows/wslc/commands/ImageRemoveCommand.cpp).

The development machine passed the pre-upgrade distribution checks on WSL 2.9.9, including real desktop inventory and the older-runtime container gate. See [validation results](wsl-containers-validation.md) for the runtime upgrade and native acceptance status. Passing mock and archive tests establish application behavior, not native export fidelity or stable-runtime compatibility. Configuration coverage and named-volume helper gates remain until their contracts are established, even after an authorized runtime upgrade. The following procedure describes the release checks after those gates are resolved.

## Stable-runtime recovery smoke test

Run only after an authorized stable-runtime setup is available, using newly created test resources with an identifiable test prefix. Record WSL version, architecture, the captured session ID and before/after inventories. Do not run global WSL shutdown or mutate existing workloads.

1. Create a no-mount test container from an approved local image. Set a nondefault environment value, working directory, user and process arguments. Write uniquely identifiable bytes and a file owned by a nonroot Linux user into its writable filesystem.
2. Confirm current native coverage reports the schema limitation and refuses complete backup without exporting data. After an authoritative configuration contract is implemented, confirm every effective setting matches the capture, stop only this test container and make a complete backup through WSL UI.
3. Restore under a new name. Confirm it is stopped, its ID differs, the original remains present and configuration values match. Start only the restored test container and verify byte hashes, ownership, modes, symlinks and relevant xattrs inside Linux.
4. Corrupt an outer member and attempt another restore. Confirm rejection occurs before any runtime image or container is created. Repeat with missing members, an occupied name and low staging space.
5. Inject export interruption and import/create failure on test resources. Verify no completed backup appears and only attempt-owned resources are cleaned up. Confirm a replaced session stops the operation without deleting anything in its replacement.
6. For named volumes, first select and pin a helper image by immutable digest for both supported architectures. Prove metadata preservation, refusal of shared active writers, bounded output, a fresh-volume restore and failure cleanup. Enable native named-volume support only after these checks pass with a data-bearing test service.
7. Remove only the test objects explicitly recorded in this run. Record the results and any remaining capability gates.

## Add container gallery

The Add container action now offers ten curated developer-service recipes with logos, search and category filters. Review editable ports, named storage and service credentials before creation, or choose Custom image. See [the catalog and native validation](container-catalog.md).
