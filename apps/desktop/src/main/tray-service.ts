interface WindowLike {
  on(event: 'minimize' | 'close', listener: (event: { preventDefault(): void }) => void): void;
  hide(): void;
  show(): void;
  focus(): void;
  isVisible?(): boolean;
  isMinimized?(): boolean;
  restore(): void;
}

interface TrayLike {
  on(event: 'click', listener: () => void): void;
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
}

interface MenuItemLike {
  label: string;
  click?: () => void;
}

interface TrayServiceOptions {
  TrayCtor: new (icon: unknown) => TrayLike;
  buildFromTemplate: (template: MenuItemLike[]) => unknown;
  icon: unknown;
  onQuitRequested: () => void;
}

export class TrayService {
  private tray: TrayLike | null = null;

  constructor(private readonly options: TrayServiceOptions) {}

  attach(window: WindowLike) {
    if (!this.tray) {
      this.tray = new this.options.TrayCtor(this.options.icon);
      this.tray.setToolTip('KAster CTI Agent');
      this.tray.setContextMenu(
        this.options.buildFromTemplate([
          {
            label: '열기',
            click: () => this.showWindow(window),
          },
          {
            label: '종료',
            click: () => this.options.onQuitRequested(),
          },
        ]),
      );
      this.tray.on('click', () => this.showWindow(window));
    }

    window.on('minimize', (event) => {
      event.preventDefault();
      window.hide();
    });
    window.on('close', (event) => {
      event.preventDefault();
      window.hide();
    });
  }

  showWindow(window: WindowLike) {
    if (window.isMinimized?.()) {
      window.restore();
    }
    if (!window.isVisible?.() || window.isMinimized?.()) {
      window.show();
    } else {
      window.show();
    }
    window.focus();
  }
}
