#define MyAppName "NAVDECK Logbook"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "NAVDECK"
#define MyAppExeName "NavdeckLogbook.exe"

[Setup]
SourceDir=..\..
AppId=NAVDECK.Logbook
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\NAVDECK Logbook
DisableProgramGroupPage=yes
OutputDir=logbook-installer
OutputBaseFilename=NAVDECK-Logbook-Setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
SetupIconFile=desktop\NavdeckLogbook\navdeck.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "logbook-output\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NAVDECK Logbook"; Flags: nowait postinstall skipifsilent
