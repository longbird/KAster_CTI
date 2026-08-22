using System.Net;
using System.Runtime.Versioning;
using KAster.Desktop.Softphone.Audio;
using SIPSorcery.Media;
using SIPSorcery.SIP;
using SIPSorcery.SIP.App;

namespace KAster.Desktop.Softphone;

/// <summary>
/// PBX 에 SIP UDP 로 직접 등록하는 소프트폰. WebSocket 이나 WebRTC 를 거치지 않는다.
///
/// 등록 실패는 예외로 던지지 않고 <see cref="RegistrationStatusChanged"/> 로만 알린다.
/// 소프트폰이 안 붙었다고 앱 전체가 못 뜨면 상담원이 화면조차 볼 수 없다.
///
/// 통화의 정체(callId·고객·상태)는 서버가 진실원이다. 이 클래스는 소리와 회선만 다룬다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SipSoftphoneClient : ISoftphoneControl, IDisposable
{
    private readonly object _gate = new();
    private readonly Func<WasapiAudioEndPoint> _audioFactory;

    private SIPTransport? _transport;
    private SIPRegistrationUserAgent? _registrar;
    private SoftphoneOptions? _options;

    private SIPUserAgent? _userAgent;
    private SIPServerUserAgent? _pendingCall;
    private WasapiAudioEndPoint? _audio;

    /// <param name="audioFactory">
    /// 통화마다 새 오디오 엔드포인트를 만든다. 장치 선택이 통화 사이에 바뀔 수 있어 재사용하지 않는다.
    /// </param>
    public SipSoftphoneClient(Func<WasapiAudioEndPoint> audioFactory) => _audioFactory = audioFactory;

    public event EventHandler<RegistrationStatus>? RegistrationStatusChanged;

    public event EventHandler<SoftphoneCallStatus>? CallStatusChanged;

    public RegistrationStatus Status { get; private set; } = new(RegistrationState.Stopped);

    public SoftphoneOptions? Options => _options;

    public SIPTransport? Transport => _transport;

    public SoftphoneCallStatus CallStatus { get; private set; } = new(SoftphoneCallState.Idle);

    /// <summary>마이크 끄기. 회선은 그대로 두고 무음을 보낸다.</summary>
    public bool IsMuted
    {
        get => _audio?.IsMuted ?? false;
        set
        {
            if (_audio is not null) _audio.IsMuted = value;
        }
    }

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

            // PBX 가 주기적으로 OPTIONS 를 보내 단말이 살아 있는지 확인한다 (qualify).
            // 답하지 않으면 Contact 가 Unavailable 로 표시되고 <b>전화가 오지 않는다.</b>
            // 이 응답은 NAT 매핑을 열어 두는 역할도 한다 — 공유기는 조용한 UDP 구멍을 금방 닫는다.
            transport.SIPTransportRequestReceived += async (_, _, request) =>
            {
                if (request.Method != SIPMethodsEnum.OPTIONS) return;
                await transport.SendResponseAsync(
                    SIPResponse.GetResponse(request, SIPResponseStatusCodesEnum.Ok, null));
            };

            var userAgent = new SIPUserAgent(transport, null);
            userAgent.OnIncomingCall += HandleIncomingCall;
            userAgent.OnCallHungup += _ => EndCall("상대가 끊었다");

            _transport = transport;
            _registrar = registrar;
            _userAgent = userAgent;

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

    /// <summary>수신 INVITE. 180 Ringing 까지만 보내고 받을지 말지는 사용자가 정한다.</summary>
    private void HandleIncomingCall(SIPUserAgent userAgent, SIPRequest request)
    {
        var uas = userAgent.AcceptCall(request);
        uas.Progress(SIPResponseStatusCodesEnum.Ringing, null, null, null, null);

        var from = request.Header.From;
        var info = new IncomingCallInfo(
            request.Header.CallId,
            from?.FromURI?.User ?? string.Empty,
            from?.FromName ?? string.Empty);

        lock (_gate)
        {
            _pendingCall = uas;
        }

        RaiseCall(new SoftphoneCallStatus(SoftphoneCallState.Ringing, info));
    }

    /// <summary>사용자가 받기를 눌렀을 때. 오디오를 열고 200 OK 를 보낸다.</summary>
    public async Task<bool> AnswerAsync()
    {
        SIPServerUserAgent? uas;
        SIPUserAgent? userAgent;
        lock (_gate)
        {
            uas = _pendingCall;
            userAgent = _userAgent;
        }

        if (uas is null || userAgent is null) return false;

        var audio = _audioFactory();
        // 오디오 엔드포인트가 alaw/ulaw 만 내놓으므로 SDP 제안도 그 둘로 한정된다.
        var session = new VoIPMediaSession(audio.ToMediaEndPoints());

        // PBX 가 시그널링과 다른 포트에서 RTP 를 보내는 구성이 흔하다. 막으면 한쪽 소리가 안 들린다.
        session.AcceptRtpFromAny = true;

        var answered = await userAgent.Answer(uas, session);
        if (!answered)
        {
            audio.Dispose();
            EndCall("응답에 실패했다");
            return false;
        }

        lock (_gate)
        {
            _audio = audio;
            _pendingCall = null;
        }

        RaiseCall(new SoftphoneCallStatus(SoftphoneCallState.Answered, CallStatus.Call));
        return true;
    }

    /// <summary>
    /// 통화 중 키패드. RFC2833(telephone-event)로 보낸다 — 음성 대역에 톤을 섞는 방식은
    /// 코덱을 지나며 뭉개져 상대가 못 알아듣는 경우가 있다.
    ///
    /// 통화 중이 아니면 아무 일도 하지 않는다. 눌러도 갈 곳이 없다.
    /// </summary>
    public async Task SendDigitAsync(char digit)
    {
        SIPUserAgent? userAgent;
        lock (_gate)
        {
            userAgent = _userAgent;
        }

        if (userAgent is null || !userAgent.IsCallActive) return;

        try
        {
            await userAgent.SendDtmf((byte)ToneOf(digit));
        }
        catch (Exception)
        {
            // 키 하나 못 보낸 것으로 통화를 끊지 않는다. 상담원이 다시 누르면 된다.
        }
    }

    /// <summary>RFC2833 이벤트 번호. 0-9 는 그대로, * 는 10, # 은 11 이다.</summary>
    private static int ToneOf(char digit) => digit switch
    {
        >= '0' and <= '9' => digit - '0',
        '*' => 10,
        '#' => 11,
        >= 'A' and <= 'D' => 12 + (digit - 'A'),
        _ => 0,
    };

    /// <summary>사용자가 끊기를 눌렀을 때. 아직 안 받은 통화면 거절한다.</summary>
    public void Hangup()
    {
        lock (_gate)
        {
            if (_pendingCall is not null)
            {
                _pendingCall.Reject(SIPResponseStatusCodesEnum.BusyHere, null);
                _pendingCall = null;
            }
            else
            {
                _userAgent?.Hangup();
            }
        }

        EndCall("이 단말에서 끊었다");
    }

    /// <summary>
    /// 통화 종료. 상대가 끊으면 <c>OnCallHungup</c> 이, 사용자가 끊으면 <see cref="Hangup"/> 이 부른다.
    /// 두 경로가 겹치는 것이 정상이므로 **이미 끝난 통화는 다시 알리지 않는다.**
    /// 안 그러면 화면에 종료가 두 번 올라온다.
    /// </summary>
    private void EndCall(string reason)
    {
        lock (_gate)
        {
            if (CallStatus.State == SoftphoneCallState.Idle) return;

            _audio?.Dispose();
            _audio = null;
            _pendingCall = null;
        }

        RaiseCall(new SoftphoneCallStatus(SoftphoneCallState.Ended, null, reason));
        RaiseCall(new SoftphoneCallStatus(SoftphoneCallState.Idle));
    }

    private void RaiseCall(SoftphoneCallStatus status)
    {
        if (CallStatus == status) return;
        CallStatus = status;
        CallStatusChanged?.Invoke(this, status);
    }

    private void StopCore()
    {
        _audio?.Dispose();
        _audio = null;
        _pendingCall = null;

        _userAgent?.Close();
        _userAgent?.Dispose();
        _userAgent = null;

        // 종료할 때 PBX 에서 Contact 를 지우려면 해지 REGISTER 가 인증을 통과해야 하는데,
        // SIPSorcery 10.0.16 은 이 경로에서 401 챌린지에 응답하지 않는다 (2026-08-21 실측: 6초를 기다려도
        // 인증 없는 REGISTER 만 4회 재전송하고 끝난다). 그래서 여기서 기다려도 얻는 것이 없다.
        // 죽은 Contact 는 PBX 쪽 `remove_existing=yes` 로 처리한다 — 앱이 강제 종료되면 어차피
        // 해지를 보낼 수 없으므로 정리 책임은 PBX 에 있어야 한다.
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
