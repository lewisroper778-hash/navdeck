export const AUTH = {
  signInButton: "sign-in-button",
  signUpButton: "sign-up-button",
  userMenu: "user-menu",
};

export const NAV = {
  logo: "nav-logo",
  dashboardLink: "nav-dashboard-link",
  settingsLink: "nav-settings-link",
};

export const DASH = {
  importButton: "import-ofp-button",
  flightCard: (id) => `flight-card-${id}`,
  emptyState: "flights-empty-state",
  flightList: "flights-list",
};

export const DETAIL = {
  summary: "flight-summary",
  fuelCard: "fuel-plan-card",
  navlogTable: "navlog-table",
  waypointRow: (ident) => `waypoint-row-${ident}`,
  waypointToggle: (ident) => `waypoint-toggle-${ident}`,
  printButton: "print-pdf-button",
  resetButton: "reset-tracker-button",
  deleteButton: "delete-flight-button",
};

export const SETTINGS = {
  pilotIdInput: "simbrief-pilot-id-input",
  displayNameInput: "display-name-input",
  saveButton: "save-settings-button",
};
