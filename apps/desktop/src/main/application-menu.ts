export interface ApplicationMenuController {
  setApplicationMenu(menu: null): void;
}

export function hideApplicationMenu(menu: ApplicationMenuController): void {
  menu.setApplicationMenu(null);
}
