from PIL import Image, ImageDraw, ImageFont
import math


W, H = 1900, 1220
OUT = "docs/proposals/ipcc-system-configuration-diagram.png"


def font(size: int, bold: bool = False):
    path = "C:/Windows/Fonts/malgunbd.ttf" if bold else "C:/Windows/Fonts/malgun.ttf"
    return ImageFont.truetype(path, size=size)


img = Image.new("RGB", (W, H), "#f5f7fb")
d = ImageDraw.Draw(img)

title_font = font(42, True)
sub_font = font(22)
section_font = font(25, True)
box_font = font(24, True)
small_font = font(19)
tiny_font = font(16)


def rounded(box, fill, outline="#c7cfdd", radius=22, width=2):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def box(x, y, w, h, title, body="", fill="#ffffff", outline="#c7cfdd", accent=None, title_size=24):
    rounded((x, y, x + w, y + h), fill, outline)
    if accent:
        d.rounded_rectangle((x, y, x + w, y + 12), radius=8, fill=accent, outline=accent)
    d.text((x + 22, y + 24), title, font=font(title_size, True), fill="#111827")
    if body:
        d.multiline_text((x + 22, y + 62), body, font=small_font, fill="#374151", spacing=7)
    return (x, y, x + w, y + h)


def label(x, y, text, color="#374151"):
    bb = d.textbbox((0, 0), text, font=tiny_font)
    pad = 8
    d.rounded_rectangle((x, y, x + bb[2] - bb[0] + pad * 2, y + 30), radius=8, fill="#ffffff", outline="#d7deea")
    d.text((x + pad, y + 6), text, font=tiny_font, fill=color)


def arrow(start, end, color="#4b5563", width=4, text=None, label_xy=None):
    x1, y1 = start
    x2, y2 = end
    d.line((x1, y1, x2, y2), fill=color, width=width)
    ang = math.atan2(y2 - y1, x2 - x1)
    size = 16
    pts = [
        (x2, y2),
        (x2 - size * math.cos(ang - 0.45), y2 - size * math.sin(ang - 0.45)),
        (x2 - size * math.cos(ang + 0.45), y2 - size * math.sin(ang + 0.45)),
    ]
    d.polygon(pts, fill=color)
    if text and label_xy:
        label(label_xy[0], label_xy[1], text)


def poly_arrow(points, color="#4b5563", width=4, text=None, label_xy=None):
    for i in range(len(points) - 2):
        d.line((*points[i], *points[i + 1]), fill=color, width=width)
    arrow(points[-2], points[-1], color=color, width=width)
    if text and label_xy:
        label(label_xy[0], label_xy[1], text)


def section(x, y, w, h, title):
    d.rounded_rectangle((x, y, x + w, y + h), radius=28, fill="#eef3fb", outline="#d7deea", width=2)
    d.text((x + 22, y + 16), title, font=section_font, fill="#1f2937")


d.text((60, 42), "IPCC 시스템 구성도 - KAster_CTI 통합 서버 구축안", font=title_font, fill="#111827")
d.text(
    (62, 96),
    "PBX·IVR·CTI·녹취를 1대의 통합 서버에서 운영하고, 백업 서버·DB 복제·녹취/백업 스토리지로 안정성을 확보",
    font=sub_font,
    fill="#4b5563",
)

section(50, 150, 345, 870, "외부망 / 사용자")
section(435, 150, 350, 870, "보안 경계")
section(825, 150, 520, 870, "본 시스템")
section(1385, 150, 465, 870, "백업 / 데이터")

pstn = box(88, 230, 270, 110, "PSTN / SIP Trunk", "대표번호 / DID\n통신사 회선", accent="#3b82f6")
agents = box(88, 440, 270, 145, "상담원 100명", "IP 전화기 / 소프트폰\n동시 접속 100명\n동시 통화 수 기준 산정", accent="#10b981")
admins = box(88, 680, 270, 130, "관리자 / 운영자", "대시보드\n권한 / 보고서\n녹취 조회 / 감사", accent="#6366f1")
external = box(88, 865, 270, 120, "외부 연동 대상", "콜마너 인입 연동\n상담원 외부 앱 연동\nAI센터 / 지방 SPNet", accent="#f59e0b")

fw = box(475, 235, 270, 160, "방화벽 / SBC", "SIP 경계 보안\nVPN / 관리자 접근제어\n200~300 세션급\n로그 연동", accent="#ef4444")
api_gate = box(475, 550, 270, 150, "외부 API 게이트", "API 키/서명\n타임아웃 / 재시도\n실패 큐 / 재처리", accent="#14b8a6")
security = box(475, 815, 270, 150, "보안 통제", "망 분리\n관리자 IP 제한\n감사 로그\n녹취 암호화", accent="#8b5cf6")

main = box(
    865,
    230,
    440,
    330,
    "통합 서버 1대",
    "Ubuntu Server 24.04 LTS\nPBX 호처리 / Queue\nIVR / ARS / TTS 정책\nK-CTI Engine / WebSocket\nAMI 이벤트 / Outbox\n녹취 로컬 스풀\n외부 인입 연동 모듈",
    accent="#2563eb",
)
apps = box(
    865,
    640,
    440,
    165,
    "상담/관리 애플리케이션",
    "상담원 웹 앱\n관리자 웹 앱\n외부 솔루션 연동 앱\n통화 제어 / 상태 / 리포트",
    accent="#059669",
)
monitor = box(
    865,
    860,
    440,
    120,
    "운영 모니터링",
    "통화 / Queue / 상담원 / DB / AMI 상태\n장애 알림 / 절체 Runbook",
    accent="#7c3aed",
)

standby = box(
    1425,
    230,
    380,
    170,
    "백업용 통합 서버 1대",
    "Ubuntu Server 24.04 LTS\nPBX/IVR/K-CTI/REC Standby\n설정 동기화 / 장애 절체",
    accent="#0ea5e9",
)
db1 = box(
    1425,
    465,
    180,
    145,
    "DB 본",
    "PostgreSQL\nRedis\nNVMe",
    accent="#22c55e",
    title_size=22,
)
db2 = box(
    1625,
    465,
    180,
    145,
    "DB 복제",
    "Streaming\nReplication\n백업",
    accent="#16a34a",
    title_size=22,
)
storage = box(
    1425,
    690,
    380,
    150,
    "스토리지 서버 1대",
    "녹취 파일 저장\nDB 백업 저장\n스냅샷 / 암호화 / 3년 보관",
    accent="#f59e0b",
)
drill = box(
    1425,
    900,
    380,
    80,
    "정기 절체 리허설 / 복구 훈련 / 감사 증적",
    "",
    outline="#f59e0b",
    title_size=23,
)

arrow((358, 285), (475, 315), "#2563eb", text="인입", label_xy=(392, 274))
arrow((745, 315), (865, 315), "#2563eb")
poly_arrow([(745, 360), (790, 360), (790, 132), (1425, 132), (1425, 315)], "#f97316", text="장애 시 SIP 절체", label_xy=(1070, 118))
poly_arrow([(358, 510), (410, 510), (410, 735), (865, 735)], "#10b981", text="상담 앱", label_xy=(420, 610))
poly_arrow([(358, 745), (420, 745), (420, 785), (865, 785)], "#6366f1", text="관리", label_xy=(405, 718))
arrow((358, 925), (475, 620), "#f59e0b", text="연동", label_xy=(375, 860))
arrow((745, 625), (865, 430), "#14b8a6")
arrow((745, 890), (865, 750), "#8b5cf6")

arrow((1305, 330), (1425, 315), "#0ea5e9", text="설정 동기화", label_xy=(1310, 294))
arrow((1305, 490), (1425, 525), "#22c55e", text="DB 접속", label_xy=(1315, 474))
arrow((1605, 538), (1625, 538), "#22c55e", text="복제", label_xy=(1575, 506))
poly_arrow([(1305, 520), (1360, 520), (1360, 735), (1425, 735)], "#f59e0b", text="녹취/백업", label_xy=(1320, 635))
arrow((1615, 610), (1615, 690), "#22c55e", text="DB 백업", label_xy=(1565, 638))
arrow((1615, 840), (1615, 900), "#f59e0b")

legend_y = 1055
d.rounded_rectangle((60, legend_y, 1840, 1160), radius=20, fill="#ffffff", outline="#d7deea", width=2)
d.text((88, legend_y + 22), "판단 기준", font=section_font, fill="#111827")
d.text(
    (230, legend_y + 24),
    "100명 동시 접속은 통합 서버에서 처리 가능. 핵심은 동시 통화 수와 PBX 채널 정의이며, 100명 동시 통화 시 고객 leg+상담원 leg로 200채널 전후를 고려해야 함.",
    font=small_font,
    fill="#374151",
)
d.text(
    (88, legend_y + 63),
    "최소 권장: 통합 서버 16C/32T, 64GB ECC, NVMe RAID1, 2~4TB 녹취 스풀, 10GbE / DB 서버 8C, 32~64GB, NVMe / 스토리지 usable 80TB 이상",
    font=small_font,
    fill="#374151",
)

img.save(OUT, quality=95)
print(OUT)
