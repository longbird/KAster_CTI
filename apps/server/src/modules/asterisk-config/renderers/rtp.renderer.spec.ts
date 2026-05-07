import { renderRtp } from './rtp.renderer';

describe('renderRtp', () => {
  it('renders ICE and STUN settings for WebRTC media negotiation', () => {
    expect(renderRtp({
      rtpStart: 10000,
      rtpEnd: 20000,
      stunAddress: 'stun.l.google.com:19302',
    })).toContain('stunaddr=stun.l.google.com:19302');
  });
});
