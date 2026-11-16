#define MyAppName "NAVDECK Desktop"
#define MyAppVersion "1.4.0"
#define MyAppPublisher "NAVDECK"
#define MyAppExeName "NavdeckDesktop.exe"

[Setup]
SourceDir=..\..
AppId=NAVDECK.Desktop
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\NAVDECK Desktop
DisableProgramGroupPage=yes
OutputDir=installer-output
OutputBaseFilename=NAVDECK-Desktop-Redesign-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
SetupIconFile=desktop\NavdeckDesktop\navdeck.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "desktop-output\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NAVDECK Desktop"; Flags: nowait postinstall skipifsilent
