#define MyAppName "NAVDECK EFB"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "NAVDECK"
#define MyAppExeName "NavdeckEFB.exe"

[Setup]
SourceDir=..\..
AppId=NAVDECK.EFB
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://github.com/lewisroper778-hash/navdeck
AppSupportURL=https://github.com/lewisroper778-hash/navdeck/issues
AppUpdatesURL=https://github.com/lewisroper778-hash/navdeck/releases/latest
AppCopyright=Copyright (C) 2026 NAVDECK
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=NAVDECK EFB installer
VersionInfoProductName={#MyAppName}
DefaultDirName={localappdata}\Programs\NAVDECK EFB
DisableProgramGroupPage=yes
OutputDir=efb-installer
OutputBaseFilename=NAVDECK-EFB-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
SetupIconFile=efb\host\navdeck-efb.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "efb-output\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NAVDECK EFB"; Flags: nowait postinstall skipifsilent
