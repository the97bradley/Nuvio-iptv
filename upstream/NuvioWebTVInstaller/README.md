# Nuvio WebTV Installer

Desktop app to install, update, launch, and uninstall Nuvio on:

- Samsung Tizen TVs
- LG webOS TVs

For Samsung, the flow is designed as a Nuvio version of TizenBrewInstaller: the installed package is the Nuvio WGT published in the GitHub release.

The app automatically downloads the latest Nuvio package from the GitHub release configured in `installer.config.json`.

Available actions in the app:

- `Install / Update`: uses the same flow for first installation and updates. Downloads the latest GitHub release.
- `Launch`: opens Nuvio on the TV.
- `Uninstall`: removes Nuvio from the TV.

## Start

For development:

```bash
npm install
npm start
```

To build the package:

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

With the current configuration, standalone runnable apps are generated without an installer:

- `dist/Nuvio-WebTV-Installer-<version>-Windows.exe` for Windows
- `dist/mac-arm64/Nuvio WebTV Installer.app` for macOS Apple Silicon
- `dist/Nuvio-WebTV-Installer-<version>-Linux.AppImage` for Linux x64

## App Packages

LG uses an `.ipk` file.

Samsung uses a `.wgt` file. Tizen Studio is not strictly required to create the Nuvio WGT. From the main repo, you can generate it with:

```bash
npm run package:tizen
```

The generated WGT uses the web repo's local `local.properties` to generate the runtime env script.
For Samsung P2P playback, the WGT must also include the local Tizen Web Service: `http://tizen.org/feature/web.service`, `services/tizen/enginefs-service.js`, and `services/tizen/runtime/media-http.cjs`. The installer checks these before signing and installing the package.

The installer automatically downloads the correct asset from the latest GitHub release:

- `.ipk` for LG
- `.wgt` for Samsung

## Samsung TV

Before using the installer:

1. Open `Apps` on the TV.
2. Press `12345` on the remote.
3. Enable `Developer Mode`.
4. Enter the computer IP as `Host PC IP`.
5. Restart the TV.

For Samsung, the installer first tries the direct connection used by TizenBrewInstaller, without requiring `sdb` to be installed on the PC. If the direct connection fails, it tries `sdb` as a fallback when available.

The `tizen` command is not required for the main flow.

The installer tries to:

1. connect directly to the TV in Developer Mode;
2. download and copy the Nuvio WGT to the TV;
3. install it with `vd_appinstall`, like TizenBrew/TizenBrewInstaller;
4. use `sdb` or `tizen` fallbacks only when available.

Some Samsung TVs close generic shell setup commands such as `mkdir` or `ls` with
`closed`, while still accepting a direct WGT upload and `vd_appinstall`. When
that happens, the installer skips the optional shell setup/checks and continues
with the direct upload path.

If Samsung rejects the WGT with platform error `118019`, the installer reports
that the TV is incompatible and shows the minimum Tizen version declared by the
package. It does not attempt the SDB fallback because that cannot bypass the
package's platform requirement. Older Samsung models can continue to use the
TizenBrew wrapper when available.

Manual equivalent for affected TVs:

```sh
sdb connect <tv-ip>:26101
sdb -s <tv-ip>:26101 push /absolute/path/to/signed.wgt /home/owner/share/tmp/sdk_tools/signed.wgt
sdb -s <tv-ip>:26101 shell 0 vd_appinstall NuvioTV001.NuvioTV /home/owner/share/tmp/sdk_tools/signed.wgt
```

### Samsung Signing

The installer uses the same approach as TizenBrewInstaller:

- reads the TV DUID;
- opens Samsung Account login on first use and uses the internet to create the certificate;
- creates a Samsung certificate for that TV;
- saves the certificate in the app data folder, keyed by the TV DUID rather than its network address;
- automatically re-signs the `.wgt` before installing it.

You do not need to provide manual `.p12` files.

The author certificate must remain the same for every update of an installed
application. The installer migrates older IP-based certificate files, so a DHCP
address change does not create a new signing identity. If older versions of the
installer already created multiple identities for the same TV, an update rejected
with Samsung error `118/-12` is retried with the previous identities saved for that
DUID. The identity accepted by the TV becomes the canonical identity for future
updates.

Keep the app data folder backed up. If every copy of the author certificate used
for the installed application is lost, Samsung does not allow an in-place update;
the application must be removed and installed again.

## LG TV

For LG, the app includes `@webos-tools/cli`, so the user does not need to manually install the LG webOS SDK CLI or `ares-install`.

Before using the installer:

1. Install and open the `Developer Mode` app on the LG TV.
2. Enable Developer Mode.
3. Enable `Key Server`.
4. Read the passphrase shown by the Developer Mode app.
5. In the installer, select `LG TV`, enter the IP and passphrase, then press `Install / Update`.

The LG device name is optional. If you leave it empty, the installer automatically creates a local device from the TV IP.

The app internally uses:

```text
ares-setup-device
ares-novacom --getkey
ares-install
ares-launch
```

If the TV was already configured in the past, you can also enter only the device name or IP and leave the passphrase empty.
If both the LG IP and device name are empty, the installer uses the saved default webOS device profile when one is available.
If you enter an existing LG device name with a new TV IP, the installer updates that local webOS device profile before installing.

Note: `@webos-tools/cli` brings many transitive npm dependencies. This does not mean the app is automatically dangerous, but it increases maintenance, package size, and the chance of antivirus false positives. For clean public distribution, app signing is still recommended.

## GitHub Configuration

Edit `installer.config.json`:

```json
{
  "githubRepo": "NuvioMedia/NuvioWeb",
  "webos": {
    "appId": "space.nuvio.webos",
    "assetPattern": "\\.ipk$"
  },
  "tizen": {
    "appId": "NuvioTV.NuvioTV",
    "packageId": "NuvioTV",
    "appIds": ["NuvioTV.NuvioTV", "NuvioTV"],
    "assetPattern": "\\.wgt$"
  }
}
```

The GitHub release must contain at least:

- one `.ipk` asset for LG;
- one `.wgt` asset for Samsung.

## Antivirus Notes

No tool can guarantee that an exe will never be flagged. To reduce false positives:

- sign the exe with a code-signing certificate;
- avoid dynamic downloads of unnecessary tools;
- publish reproducible builds from a clean repo;
- do not include vulnerable npm dependencies unless they are truly needed.
