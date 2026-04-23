interface WindowLike {
  isMinimized?(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

interface NotificationLike {
  show(): void;
  on(event: 'click', listener: () => void): void;
}

interface AttentionServiceOptions {
  getWindow: () => WindowLike | null;
  NotificationCtor: new (options: { title: string; body: string }) => NotificationLike;
}

export class AttentionService {
  constructor(private readonly options: AttentionServiceOptions) {}

  notifyIncomingCall(input: { title: string; body: string }) {
    const notification = new this.options.NotificationCtor({
      title: input.title,
      body: input.body,
    });
    notification.on('click', () => {
      this.focusWindow();
    });
    notification.show();
  }

  focusWindow() {
    const win = this.options.getWindow();
    if (!win) {
      return;
    }

    if (win.isMinimized?.()) {
      win.restore();
    }

    win.show();
    win.focus();
  }
}
