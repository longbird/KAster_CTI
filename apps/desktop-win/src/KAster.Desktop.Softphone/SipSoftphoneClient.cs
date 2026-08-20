using System.Net;
using SIPSorcery.SIP;
using SIPSorcery.SIP.App;

namespace KAster.Desktop.Softphone;

/// <summary>
/// PBX 에 SIP UDP 로 직접 등록하는 소프트폰. WebSocket 이나 WebRTC 를 거치지 않는다.
///
/// 등록 실패는 예외로 던지지 않고 <see cref="RegistrationStatusChanged"/> 로만 알린다.
/// 소프트폰이 안 붙었다고 앱 전체가 못 뜨면 상담원이 화면조차 볼 수 없다.
/// </summary>
public sealed class SipSoftphoneClient : IDisposable
{
    private readonly object _gate = new();
    private SIPTransport? _transport;
    private SIPRegistrationUserAgent? _registrar;
    private SoftphoneOptions? _options;

    public event EventHandler<RegistrationStatus>? RegistrationStatusChanged;

    public RegistrationStatus Status { get; private set; } = new(RegistrationState.Stopped);

    public SoftphoneOptions? Options => _options;

    public SIPTransport? Transport => _transport;

    public void Start(SoftphoneOptions options)
    {
        lock (_gate)
        {
            StopCore();

            if (options.Transport != SipTransport.Udp)
            {
                // 1단계는 UDP 직결만 지원한다. TLS 는 채널 생성과 인증서 검증이 따로 필요하다.
                Raise(new RegistrationStatus(RegistrationState.Failed, "1단계는 SIP UDP 만 지원한다"));
                return;
            }

            _options = options;
            var transport = new SIPTransport();

            // 0.0.0.0:0 으로 열면 OS 가 빈 포트를 준다. 고정 포트는 같은 PC 에 두 개를 띄울 때 충돌한다.
            transport.AddSIPChannel(new SIPUDPChannel(new IPEndPoint(IPAddress.Any, 0)));

            // AOR 은 SIP 도메인으로, 실제 목적지는 sipServer 로 나눈다.
            // 이렇게 해야 REGISTER 의 To/From 이 sip:1001@pbx.local 이 되고 다이제스트 realm 이 맞는다.
            var registrar = new SIPRegistrationUserAgent(
                transport,
                outboundProxy: null,
                sipAccountAOR: SIPURI.ParseSIPURI($"sip:{options.Username}@{options.SipDomain}"),
                authUsername: options.Username,
                password: options.Password,
                realm: options.SipDomain,
                registrarHost: $"{options.ServerHost}:{options.ServerPort}",
                // Contact 는 SIPSorcery 가 실제 채널 종단으로 바꿔 쓴다. 여기 값은 자리표시자다.
                contactURI: SIPURI.ParseSIPURI($"sip:{options.Username}@0.0.0.0"),
                expiry: options.ExpirySeconds,
                customHeaders: null,
                maxRegistrationAttemptTimeout: 60,
                registerFailureRetryInterval: 60,
                maxRegisterAttempts: 3,
                // 비밀번호가 틀린 경우까지 무한 재시도하면 서버의 SIP 보안 모듈이 이 IP 를 막는다.
                // 확정 실패는 멈추고 상태로 알린 뒤 사용자가 재로그인하게 한다.
                exitOnUnequivocalFailure: true);

            registrar.UserDisplayName = options.DisplayName;

            registrar.RegistrationSuccessful += (_, _) => Raise(new RegistrationStatus(RegistrationState.Registered));
            registrar.RegistrationFailed += (_, _, reason) => Raise(new RegistrationStatus(RegistrationState.Failed, reason));
            registrar.RegistrationTemporaryFailure += (_, _, reason) =>
                Raise(new RegistrationStatus(RegistrationState.Registering, reason));
            registrar.RegistrationRemoved += (_, _) => Raise(new RegistrationStatus(RegistrationState.Stopped));

            _transport = transport;
            _registrar = registrar;

            Raise(new RegistrationStatus(RegistrationState.Registering));
            registrar.Start();
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            StopCore();
            Raise(new RegistrationStatus(RegistrationState.Stopped));
        }
    }

    private void StopCore()
    {
        _registrar?.Stop(true);
        _registrar = null;

        _transport?.Shutdown();
        _transport?.Dispose();
        _transport = null;
        _options = null;
    }

    private void Raise(RegistrationStatus status)
    {
        if (Status == status) return;
        Status = status;
        RegistrationStatusChanged?.Invoke(this, status);
    }

    public void Dispose() => Stop();
}
