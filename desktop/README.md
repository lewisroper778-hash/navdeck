# NAVDECK Desktop (Windows x64)

NAVDECK Desktop combines the NAVDECK flight-operations web app, a local live flight map, and the existing FSUIPC7 bridge in one Windows window. Its dark aviation workspace is intended for use with Microsoft Flight Simulator.

## Install

1. Open the latest successful **NAVDECK Desktop Windows Build** under GitHub Actions.
2. Under **Artifacts**, download `NAVDECK-Desktop-Setup-x64` (ZIP).
3. Extract the ZIP and run `NAVDECK-Desktop-Setup-x64.exe`. The installer offers a Start Menu shortcut and optional desktop shortcut.
4. Launch **NAVDECK Desktop**. A Microsoft WebView2 Runtime bootstrapper is included for computers that need it; internet access may be required for its installation.

The executable has a self-contained .NET runtime. You do not need to install .NET or Python separately.

## Sign-in

The first screen is NAVDECK's existing Clerk sign-in at `test.navdeck.online`. The NAVDECK Desktop window doesn't ask for your password separately or store a copy. Choose **Stay signed in on this computer** to keep the session across launches. When this option is off, the app clears its browser sign-in data when exiting. **Sign out** in the sidebar clears local session data and returns to the login screen.

The app workspace is locked until Clerk reports an authenticated session. Signed-in web pages (Flights, SimBrief, VATSIM, NAVDECK Home, Logbook) appear in the native shell, not in a separate browser. These pages need the NAVDECK test website and its backend to be available.

## Simulator

- Start Microsoft Flight Simulator and FSUIPC7 on the same computer. The free FSUIPC7 installation supports the data used by the bridge.
- The live dashboard shows the aircraft's position, heading, altitude and groundspeed, a flight trail, and (when paired with NAVDECK) route fixes and a direct-to-next line.
- **Simulator Connection** in the left sidebar opens the existing connection controls **inside** the desktop window. Enter a NAVDECK bridge connection code there to enable NAVDECK cloud flight/waypoint synchronisation; account sign-in and bridge pairing are separate.
- The dashboard works without an active flight plan; planned route fixes appear after the bridge is paired and the flight plan is loaded.
- The flight map uses online Esri map tiles and Leaflet scripts, so an internet connection is required to render its base map.

## Scope and testing

The app and installer are built by `.github/workflows/navdeck-desktop.yml` using a Windows CI runner. The workflow publishes a self-contained Windows binary and an Inno Setup installer, verifies that the local map is packaged, and syntax-checks its JavaScript.

A successful CI build verifies compilation and packaging, **not** that authentication, FSUIPC7, MSFS aircraft data, or all web pages work on a local Windows installation. Those require a real Windows/MSFS test.

All development remains on the feature branch until it is reviewed and approved. **Do not merge or deploy without owner approval.**
