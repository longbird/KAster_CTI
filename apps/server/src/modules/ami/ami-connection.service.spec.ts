import { AmiConnectionService } from './ami-connection.service';

describe('AmiConnectionService pending action handling', () => {
  it('finishes event-list actions immediately when AMI returns an error response', async () => {
    const service = new AmiConnectionService({} as any, {} as any, {} as any, {} as any) as any;
    const resolved: any[] = [];
    const pending = {
      eventList: true,
      frames: [],
      timeout: setTimeout(() => undefined, 10000),
      resolve: (frames: any[]) => resolved.push(frames),
      reject: jest.fn(),
    };
    service.pendingActions.set('probe-1', pending);

    const handled = service.handlePendingActionFrame({
      Response: 'Error',
      ActionID: 'probe-1',
      Message: 'No Contacts found',
    });

    expect(handled).toBe(true);
    expect(service.pendingActions.has('probe-1')).toBe(false);
    expect(resolved).toEqual([[
      {
        Response: 'Error',
        ActionID: 'probe-1',
        Message: 'No Contacts found',
      },
    ]]);
  });
});
